import fs from 'node:fs/promises';
import path from 'node:path';

export default async function handler(req, res) {
  try{
    const file = path.join(process.cwd(), 'menu', 'manifest.json');
    const json = await fs.readFile(file, 'utf8');
    res.setHeader('Content-Type','application/json');
    res.status(200).end(json);
  }catch(e){
    res.status(500).json({ error: 'Failed to read manifest' });
  }
}

