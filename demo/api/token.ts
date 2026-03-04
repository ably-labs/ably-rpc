import type { VercelRequest, VercelResponse } from '@vercel/node';
import jwt from 'jsonwebtoken';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.ABLY_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ABLY_API_KEY not configured' });
  }

  const [keyName, keySecret] = apiKey.split(':');
  const clientId = (req.query.clientId as string) || `anon-${Date.now()}`;

  const token = jwt.sign(
    {
      'x-ably-capability': '{"rpc:*":["publish","subscribe","presence"]}',
      'x-ably-clientId': clientId,
    },
    keySecret,
    {
      header: { typ: 'JWT', alg: 'HS256', kid: keyName },
      expiresIn: 3600,
    }
  );

  res.setHeader('Content-Type', 'application/jwt');
  res.send(token);
}
