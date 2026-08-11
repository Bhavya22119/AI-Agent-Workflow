import { Request, Response } from 'express';

export default function handler(req: Request, res: Response) {
  res.status(200).json({ message: 'Hello from simple test' });
}
