import * as x509 from '@peculiar/x509';
import {Crypto} from '@peculiar/webcrypto';
import * as got from 'got';
import fs from 'fs';
import * as jose from 'jose';

const crypto = new Crypto();
x509.cryptoProvider.set(crypto);

const caUrl = 'https://beep.smallstep.com';
const caFingerprint = 'beep';
// this is the JWK private key from the CA's JWK provisioner.
// step ca provisioner list | jq -r '.[] | select(.name == "myjwkprovisioner") | .encryptedKey' | step crypto jwe decrypt | jq > jwk.json
const jwkFilename = 'jwk.json';
// the label of the JWK provisioner in the CA
const provisionerName = 'myjwkprovisioner';

class StepClient {
  private readonly caURL: string;
  private readonly caFingerprint: string;
  private caRootPEM: any;

  constructor(caURL: string, caFingerprint: string) {
    this.caURL = caURL;
    this.caFingerprint = caFingerprint;
  }

  async init() {
    this.caRootPEM = await this.fetchRootPEM();
  }

  async fetchRootPEM() {
    try {
      const url = new URL('/root/' + this.caFingerprint, this.caURL);
      const body: any = await got
        .got(url, {
          https: {rejectUnauthorized: false},
        })
        .json();
      return body.ca;
    } catch (error) {
      console.error(error);
    }
  }

  async health() {
    try {
      const url = new URL('/health', this.caURL);
      const body: any = await got
        .got(url, {
          https: {certificateAuthority: this.caRootPEM},
        })
        .json();
      return body.status;
    } catch (error) {
      console.error(error);
    }
  }

  get signURL(): URL {
    return new URL('/1.0/sign', this.caURL);
  }

  async sign(csr: any, token: string) {
    try {
      return await got.got
        .post(this.signURL, {
          https: {certificateAuthority: this.caRootPEM}, json: {csr: csr, ott: token},
        })
        .json();
    } catch (error: unknown) {
      if (error instanceof got.RequestError) {
        console.error(error.request);
      } else {
        console.error('Unknown error when making request: ' + error);
      }
    }
  }

  async generate_jwt(cn: string, dnsSANs: string[], audience: string, issuer: string, jwkFilename: string) {
    // make the jwk
    const jwkJSON: any = await JSON.parse(fs.readFileSync(jwkFilename).toString());
    const privateKey = await jose.importJWK(jwkJSON);
    const kid = jwkJSON.kid;

    const jwt = await new jose.SignJWT({
      sans: dnsSANs, sub: cn,
    })
      .setProtectedHeader({alg: 'ES256', kid: kid})
      .setIssuedAt()
      .setIssuer(provisionerName)
      .setAudience(audience)
      .setNotBefore('0s')
      .setExpirationTime('5m')
      .sign(privateKey);
    // console.log(jwt)
    return jwt;
  }

  async generate_csr(cn: string, dnsSANs: string[]) {
    const alg = {
      name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256',
    };
    const keys = await crypto.subtle.generateKey(alg, false, ['sign', 'verify',]);
    const csr = await x509.Pkcs10CertificateRequestGenerator.create({
      name: 'CN='.concat(cn),
      keys,
      signingAlgorithm: alg,
      extensions: [new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true), new x509.ExtendedKeyUsageExtension(['1.3.6.1.5.5.7.3.1', // server auth
        '1.3.6.1.5.5.7.3.2', // client auth
      ], false),],
    });
    return csr;
  }
}

async function create_cert(id: string, cn: string, dnsSANs: string[]) {
  const step = new StepClient(caUrl, caFingerprint);
  await step.init();

  const jwt = await step.generate_jwt(cn, dnsSANs, step.signURL.toString(), provisionerName, jwkFilename);
  const csr = await step.generate_csr(cn, dnsSANs);
  const certResponse: any = await step.sign(csr.toString('pem'), jwt);
  console.log(certResponse.crt);
}

module.exports = {create_cert};
