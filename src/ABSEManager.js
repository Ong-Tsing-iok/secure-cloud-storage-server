import * as mcl from 'mcl-wasm'
import { logger } from './Logger.js'
import ConfigManager from './ConfigManager'
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

class ABSEManager {
  constructor() {}
  async init() {
    await mcl.init(mcl.BLS12_381)
    await this.getPP()
  }
  async getPP() {
    if (this.pp) return this.pp
    try {
      const response = await fetch(`${ConfigManager.trustedAuthority.url}/pp`)
      if (!response.ok) {
        logger.warn(`Cannot get public parameter from trusted authority`, { response })
        return null
      }
      const pp = await response.json()
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
      this.pp = pp
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
  async Search(serializedTK) {
    try {
      const TK = this.parseTK(serializedTK)
      assert(TK.dPrime > 0)
      const result = new Array()
      const dPrimeFr = new mcl.Fr()
      dPrimeFr.setInt(TK.dPrime)
      const files = await getCtStars()
      files.forEach((file) => {
        const ctStar = mcl.deserializeHexStrToG1(file.ctstar)
        const ctw = getCtws(file.fileid).map((entry) => mcl.deserializeHexStrToGT(entry.ctw))
        if (ctw.length < TK.dPrime) return // Keyword to match is larger than keyword set
        const ct = getCts(file.fileid).map((entry) => mcl.deserializeHexStrToG1(entry.ct))
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
        if (backtrack(0, 0, 0)) {
          result.push(file.fileid)
        }
      })
      return result
    } catch (error) {
      logger.error(error)
      return []
    }
  }
  async insertFileIndex(CTw, fileId) {
    this.deleteFileIndex(fileId)
    await insertCtStar(fileId, CTw.ctstar)
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
}

const abseManager = new ABSEManager()
await abseManager.init()
export default abseManager
