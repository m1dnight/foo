var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import express from 'express';
import dotenv from 'dotenv';
import { auth } from 'express-oauth2-jwt-bearer';
dotenv.config();
import { create_cert } from './cert-manager/cert-manager.js';
const app = express();
const port = process.env.PORT;
const checkJwt = auth({
    audience: 'https://api.mijn.loomy.be', issuerBaseURL: 'https://dev-v03-umba.us.auth0.com/',
});
app.get('/api/public', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const cert = yield create_cert('uw ma is uw pa', 'uw ma is uw pa', []);
    res.json({
        message: 'Hello from a public endpoint! You don\'t need to be authenticated to see this.',
    });
}));
// This route needs authentication
app.get('/api/private', checkJwt, (req, res) => {
    res.json({
        message: 'Hello from a private endpoint! You need to be authenticated to see this.',
    });
});
app.post('/api/device/request-certificate', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.json({
        message: 'Here is your cert',
    });
}));
app.listen(port, () => {
    console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});
