import * as mcl from 'mcl-wasm'
import { logger } from './Logger.js'
import ConfigManager from './ConfigManager.js'
import {
  deleteCt,
  deleteCtStar,
  deleteCtw,
  getCts,
  getCtStars,
  getCtws,
  insertCt,
  insertCtStar,
  insertCtw
} from './StorageDatabase.js'
import assert from 'assert'

// This is used because we only have self-signed certificates.
// Should be removed in real deployment environment
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

class ABSEManager {
  constructor() {}
  async init() {
    await mcl.init(mcl.BLS12_381)
    await this.getPP()
  }
  async getPP() {
    if (this.pp) return this.pp
    try {
      const fetchUrl = `https://${ConfigManager.trustedAuthority.url}/pp`
      logger.info(`fetching ${fetchUrl} for public parameters.`)
      const response = await fetch(fetchUrl)
      if (!response.ok) {
        logger.warn(`Cannot get public parameter from trusted authority`, { response })
        return null
      }
      const pp = await response.json()
      logger.info(`Public parameters successfully fetched for ABSE.`)
      this.pp = {
        g1: mcl.deserializeHexStrToG1(pp.g1),
        g2: mcl.deserializeHexStrToG2(pp.g2),
        eggalpha: mcl.deserializeHexStrToGT(pp.eggalpha),
        h: mcl.deserializeHexStrToG1(pp.h),
        h_i: new Array(pp.h_i.length),
        U: pp.U
      }
      for (let i = 0; i < pp.h_i.length; i++) {
        this.pp.h_i[i] = mcl.deserializeHexStrToG1(pp.h_i[i])
      }
      return pp
    } catch (error) {
      logger.error(error)
      return null
    }
  }
  parseTK(serializedTK) {
    const TK = {
      TStar: mcl.deserializeHexStrToG2(serializedTK.TStar),
      T: new Array(serializedTK.T.length),
      sky: mcl.deserializeHexStrToG2(serializedTK.sky),
      dPrime: serializedTK.dPrime
    }
    for (let i = 0; i < serializedTK.T.length; i++) {
      TK.T[i] = mcl.deserializeHexStrToG2(serializedTK.T[i])
    }
    return TK
  }
  async *Search(serializedTK) {
    try {
      const TK = this.parseTK(serializedTK)
      assert(TK.dPrime > 0)
      const result = new Array()
      const dPrimeFr = new mcl.Fr()
      dPrimeFr.setInt(TK.dPrime)
      const files = await getCtStars()
      logger.debug(`Total of ${files.length} files are indexed.`)
      for (const file of files) {
        const ctStar = mcl.deserializeHexStrToG1(file.ctstar)
        const ctw = (await getCtws(file.fileid)).map((entry) =>
          mcl.deserializeHexStrToGT(entry.ctw)
        )
        const ct = (await getCts(file.fileid)).map((entry) => mcl.deserializeHexStrToG1(entry.ct))
        if (await this._singleSearch(TK, dPrimeFr, ctStar, ct, ctw)) {
          // result.push(file.fileid)
          yield file.fileid
        }
      }
      // return result
    } catch (error) {
      logger.error(error)
      // return
    }
  }
  async _singleSearch(TK, dPrimeFr, ctStar, ct, ctw) {
    if (ctw.length < TK.dPrime) return false // Keyword to match is larger than keyword set
    const eCtStarSky = mcl.pairing(ctStar, TK.sky)
    assert(ct.length == TK.T.length)
    assert(ct.length >= 1)
    let prod = mcl.pairing(ct[0], TK.T[0])
    for (let i = 1; i < ct.length; i++) {
      const paired = mcl.pairing(ct[i], TK.T[i])
      prod = mcl.mul(prod, paired)
    }
    const B = mcl.mul(eCtStarSky, prod)
    // console.log(B)
    const D = mcl.div(mcl.pairing(ctStar, TK.TStar), mcl.pow(B, dPrimeFr))
    const backtrack = (currentProd, startIndex, depth) => {
      // Might need to refactor into iteration later
      if (depth == TK.dPrime) {
        // depth start from 0
        // Check if D == D'
        return D.isEqual(currentProd)
      }
      for (let i = startIndex; i < ctw.length - (TK.dPrime - depth) + 1; i++) {
        let newProd
        if (depth == 0) newProd = ctw[i]
        else newProd = mcl.mul(currentProd, ctw[i])
        // console.log(newProd)
        if (backtrack(newProd, i + 1, depth + 1)) return true
      }
    }
    return backtrack(0, 0, 0)
  }
  async EncForAllAttr(W) {
    const pp = await this.getPP()
    // Access policy vector x
    const x = new Array(pp.U.length + 1)
    let sum = new mcl.Fr()
    let i
    for (i = 0; i < pp.U.length; i++) {
      const xi = new mcl.Fr()
      // if (P.includes(pp.U[i])) { <-- Not needed for all attr to search 
      //   xi.setByCSPRNG()
      //   sum = mcl.add(sum, xi)
      // }
      x[i] = xi
    }
    x[i] = mcl.neg(sum)
    sum = new mcl.Fr()
    for (i = 0; i < x.length; i++) {
      sum = mcl.add(sum, x[i])
    }
    assert(sum.isZero())
    const t = new mcl.Fr()
    t.setByCSPRNG()
    const ctStar = mcl.mul(pp.h, t)
    const eggat = mcl.pow(pp.eggalpha, t)
    const ctw = new Array(W.length)
    for (i = 0; i < W.length; i++) {
      const wHash = mcl.hashToFr(W[i])
      const P = mcl.pairing(mcl.mul(pp.g1, wHash), mcl.mul(pp.g2, t))
      ctw[i] = mcl.mul(eggat, P)
    }
    const ct = new Array(pp.h_i.length)
    for (i = 0; i < pp.h_i.length; i++) {
      ct[i] = mcl.add(mcl.mul(pp.h_i[i], t), mcl.mul(pp.g1, x[i]))
    }
    const CTw = { ctStar, ctw, ct }
    // console.log(CTm);
    // console.log(CTw);
    return CTw
  }
  async insertFileIndex(CTw, fileId) {
    await this.deleteFileIndex(fileId)
    await insertCtStar(fileId, CTw.ctStar)
    for (let i = 0; i < CTw.ctw.length; i++) {
      await insertCtw(fileId, i, CTw.ctw[i])
    }
    for (let i = 0; i < CTw.ct.length; i++) {
      await insertCt(fileId, i, CTw.ct[i])
    }
  }
  async deleteFileIndex(fileId) {
    await deleteCtw(fileId)
    await deleteCt(fileId)
    await deleteCtStar(fileId)
  }
  async checkTKTags(serializedTK, tags) {
    // Encrypt a file with the tags and all attributes
    const CTw = await this.EncForAllAttr(tags)
    // Try to use TK to search for this file
    const TK = this.parseTK(serializedTK)
    assert(TK.dPrime > 0)
    const dPrimeFr = new mcl.Fr()
    dPrimeFr.setInt(TK.dPrime)
    return await this._singleSearch(TK, dPrimeFr, CTw.ctStar, CTw.ct, CTw.ctw)
  }
}

const abseManager = new ABSEManager()
await abseManager.init()
export default abseManager
