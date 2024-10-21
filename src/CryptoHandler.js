import { PythonShell } from 'python-shell'
import { __crypto_filepath } from './Constants.js'
const params =
  '{"g": "eJw9UEsOQjEIvErTdRel/3oVY5qneTt3T02M8e4y0LoooTMwA3zsGLf7dhxj2JOx1/djP6wzjL62+3MX9Jy6M7k5U7IzyFtxhrx3pgJkoDBQ+eXEBHHolT9Bq4mYaZEfoQ2lFQmEhPazqYqscNOMqCEIRCqfoMxU91OjiiqMAzKCa5wjQSJ4baAQQGelyePns+6A6dSPZmhizPKpaUn22thh2XVD5HqHOPdfoutKWDn9tw06luriphiE4L3WbGkdMc46CZit0OX7A0m4Upk=", "u": "eJw1UEEOAjEI/ErTcw/QbQvrV4xpVrO3va2aGOPfhUIPbWCAmYFv7P1xbOfZe7yEeP889zOmIOh7O177QK9lTaFyCm21N/KSAiKlQEsKDJLkLImioIhWqrasXtIBEpJ1PikQGa7dtQn5mCiWIMjHmiwuxRJQ1kSCIhycbUa5EASog0DV8nQkrVXNNJNHoKkDFjAKgS4AxdURcK4xhaqtYwzodNnOMQBuvg64WXM8jWGWnsYuUNjdKS+CntQvQX67Mai3U4cNb78/0oxR1A==", "v": "eJxNUEEOwjAM+8q08w5J1zQpX0GoGmi33QZICPF30iRDXNLUdhy377G127bse2vjaRivr/u6j9Og6HPZHquh51yngWQaWE9MoAW1UOlN6oW0gHaskBivyirRIIpTfzcOHsrhloKypptV+PGqLjXg3Mdn1c2HYUqO1OprMvsdgdyuWD5FSS2FXeGglqIjDL6PbWcO5zy7FAEjhSW0F3Y76Qs7BRAx7CuIPC5FWkTVELu2xlyu4cspvpHFx6S4WiKBRelpC14+X9yjUuI=", "Z": "eJxNUstOxDAM/JWo5x7itI4TfgWtqgXtbW8FJIT4dzx+VBzcJrE9npnkZzmO9+f9PI9jeSnL2/fH41zWoqdf9+fnw05fmdbCYy1Up34aYbWvZehutLWIaLD/Lcu6GVogFZWbZ1E5ugbjMNp2CVSJqgnM6pVEmuXNcQamUndwSQo2Vv+cOIY8RpDT3s6RmRlgC5wabSTB0hFtYWJr7Mi4BO5EG8RfrVQd0IShdgcPmkmzOYyp0pjDiRGZIr7GgZc2sSL0Hk6w93Yt4IYiQ+wunCl7baoupKVR2+VHwPZIw0uMcP49LkqcLGaaN5gpjoW5KLaYSZn2i/fIm5IAkLiBGuOhAoimLL0xKemFJPb1tmCzOwSEnnNBBg/A1Ey3wS7ApfSA8Eu051hDXU1XWsvnwv+d2F0xnkun2+8fa8GTVA=="}'

const encrypt = async (publicKey, message) => {
  return await PythonShell.run(__crypto_filepath, {
    args: ['--encrypt', '-P', `${params}`, '-p', `${publicKey}`, '-m', message]
  })[0]
}

const reencrypt = async (rekey, cipher) => {
  return await PythonShell.run(__crypto_filepath, {
    args: ['--re-encrypt', '-P', `${params}`, '-r', `${rekey}`, '-c', `${cipher}`]
  })[0]
}

const CryptoHandler = {
  encrypt,
  reencrypt
}
export default CryptoHandler
