import { gzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);

export async function compressXml(
  xml: string
): Promise<Buffer> {
  return gzipAsync(xml, {
    level: 9
  });
}
