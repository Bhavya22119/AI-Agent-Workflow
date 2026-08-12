/**
 * Favicon, generated from the logo mark.
 *
 * The mark is white artwork on transparency, which is invisible against a light
 * browser tab and invisible against a dark one once inverted — there is no single
 * flat version that survives both. So it is composited onto the accent colour
 * here: one image that reads correctly whatever the surrounding chrome is doing.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default async function Icon() {
  const mark = await readFile(join(process.cwd(), 'public/mark.png'));

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // The accent, resolved: `oklch(52% 0.19 264)` from globals.css. Written
          // literally because Satori has no access to the stylesheet's tokens.
          background: '#4f46e5',
          borderRadius: 14,
        }}
      >
        {/* Satori renders this, not a browser: next/image has no meaning here. */}
        <img
          src={`data:image/png;base64,${mark.toString('base64')}`}
          alt=""
          width={46}
          height={46}
        />
      </div>
    ),
    size,
  );
}
