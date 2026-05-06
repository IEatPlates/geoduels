export async function readError(resp: Response, fallback: string) {
  const text = await resp.text();
  return text || fallback;
}
