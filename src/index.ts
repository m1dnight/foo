import express, {Express, Request, Response} from 'express';
import dotenv from 'dotenv';
import {auth} from 'express-oauth2-jwt-bearer';

dotenv.config();

import {create_cert} from './cert-manager/cert-manager.js'

const app: Express = express();
const port = process.env.PORT;

const checkJwt = auth({
  audience: 'https://api.mijn.loomy.be', issuerBaseURL: 'https://dev-v03-umba.us.auth0.com/',
});

app.get('/api/public', async (req: Request, res: Response) => {
  const cert = await create_cert('uw ma is uw pa', 'uw ma is uw pa', []);

  res.json({
    message: 'Hello from a public endpoint! You don\'t need to be authenticated to see this.',
  });
});

// This route needs authentication
app.get('/api/private', checkJwt, (req: Request, res: Response) => {
  res.json({
    message: 'Hello from a private endpoint! You need to be authenticated to see this.',
  });
});

app.post('/api/device/request-certificate', async (req: Request, res: Response) => {
  res.json({
    message: 'Here is your cert',
  });
});

app.listen(port, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});
