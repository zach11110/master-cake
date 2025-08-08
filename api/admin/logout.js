export default async function handler(req, res) {
  res.setHeader('Set-Cookie', `admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`);
  res.status(200).json({ ok: true });
}

