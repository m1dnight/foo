"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const x509 = __importStar(require("@peculiar/x509"));
const webcrypto_1 = require("@peculiar/webcrypto");
const got = __importStar(require("got"));
const fs_1 = __importDefault(require("fs"));
const jose = __importStar(require("jose"));
const crypto = new webcrypto_1.Crypto();
x509.cryptoProvider.set(crypto);
const caUrl = 'https://alliterative-tortoise.loomy.ca.smallstep.com';
const caFingerprint = '95e4079f140ef35d4cafa8f1c9aec04202f97c582706ab12e66b7a6e9639f232';
// this is the JWK private key from the CA's JWK provisioner.
// step ca provisioner list | jq -r '.[] | select(.name == "myjwkprovisioner") | .encryptedKey' | step crypto jwe decrypt | jq > jwk.json
const jwkFilename = 'jwk.json';
// the label of the JWK provisioner in the CA
const provisionerName = 'myjwkprovisioner';
class StepClient {
    constructor(caURL, caFingerprint) {
        this.caURL = caURL;
        this.caFingerprint = caFingerprint;
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            this.caRootPEM = yield this.fetchRootPEM();
        });
    }
    fetchRootPEM() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const url = new URL('/root/' + this.caFingerprint, this.caURL);
                const body = yield got
                    .got(url, {
                    https: { rejectUnauthorized: false },
                })
                    .json();
                return body.ca;
            }
            catch (error) {
                console.error(error);
            }
        });
    }
    health() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const url = new URL('/health', this.caURL);
                const body = yield got
                    .got(url, {
                    https: { certificateAuthority: this.caRootPEM },
                })
                    .json();
                return body.status;
            }
            catch (error) {
                console.error(error);
            }
        });
    }
    get signURL() {
        return new URL('/1.0/sign', this.caURL);
    }
    sign(csr, token) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return yield got.got
                    .post(this.signURL, {
                    https: { certificateAuthority: this.caRootPEM }, json: { csr: csr, ott: token },
                })
                    .json();
            }
            catch (error) {
                if (error instanceof got.RequestError) {
                    console.error(error.request);
                }
                else {
                    console.error('Unknown error when making request: ' + error);
                }
            }
        });
    }
    generate_jwt(cn, dnsSANs, audience, issuer, jwkFilename) {
        return __awaiter(this, void 0, void 0, function* () {
            // make the jwk
            const jwkJSON = yield JSON.parse(fs_1.default.readFileSync(jwkFilename).toString());
            const privateKey = yield jose.importJWK(jwkJSON);
            const kid = jwkJSON.kid;
            const jwt = yield new jose.SignJWT({
                sans: dnsSANs, sub: cn,
            })
                .setProtectedHeader({ alg: 'ES256', kid: kid })
                .setIssuedAt()
                .setIssuer(provisionerName)
                .setAudience(audience)
                .setNotBefore('0s')
                .setExpirationTime('5m')
                .sign(privateKey);
            // console.log(jwt)
            return jwt;
        });
    }
    generate_csr(cn, dnsSANs) {
        return __awaiter(this, void 0, void 0, function* () {
            const alg = {
                name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256',
            };
            const keys = yield crypto.subtle.generateKey(alg, false, ['sign', 'verify',]);
            const csr = yield x509.Pkcs10CertificateRequestGenerator.create({
                name: 'CN='.concat(cn),
                keys,
                signingAlgorithm: alg,
                extensions: [new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true), new x509.ExtendedKeyUsageExtension(['1.3.6.1.5.5.7.3.1',
                        '1.3.6.1.5.5.7.3.2', // client auth
                    ], false),],
            });
            return csr;
        });
    }
}
function create_cert(id, cn, dnsSANs) {
    return __awaiter(this, void 0, void 0, function* () {
        const step = new StepClient(caUrl, caFingerprint);
        yield step.init();
        const jwt = yield step.generate_jwt(cn, dnsSANs, step.signURL.toString(), provisionerName, jwkFilename);
        const csr = yield step.generate_csr(cn, dnsSANs);
        const certResponse = yield step.sign(csr.toString('pem'), jwt);
        console.log(certResponse.crt);
    });
}
module.exports = { create_cert };
