/**
 * Unit tests — shared utilities (waitForPort, findFreePort, isValidWsUrl)
 */
import * as net  from 'net';
import { isValidWsUrl, findFreePort } from '../../rovant-app/src/utils';

// ── isValidWsUrl ──────────────────────────────────────────────────────────────
describe('isValidWsUrl', () => {
    const valid = [
        'ws://localhost:9090',
        'ws://192.168.1.10:9090',
        'wss://robot.local:9090',
        'ws://127.0.0.1:9090/rosbridge',
    ];
    const invalid = [
        'http://localhost:9090',  // wrong protocol
        'localhost:9090',          // no protocol
        '',                        // empty
        'not-a-url',               // garbage
        'ftp://robot:9090',        // wrong scheme
    ];

    valid.forEach(url => {
        it(`accepts valid WS URL: ${url}`, () => {
            expect(isValidWsUrl(url)).toBe(true);
        });
    });

    invalid.forEach(url => {
        it(`rejects invalid URL: "${url}"`, () => {
            expect(isValidWsUrl(url)).toBe(false);
        });
    });
});

// ── findFreePort ──────────────────────────────────────────────────────────────
describe('findFreePort', () => {
    it('returns a port >= preferred when preferred is free', async () => {
        const port = await findFreePort(45678);
        expect(port).toBeGreaterThanOrEqual(45678);
        expect(port).toBeLessThan(45698);
    });

    it('returns a different port when preferred is occupied', async () => {
        const server = net.createServer();
        await new Promise<void>(r => server.listen(45700, '127.0.0.1', r));
        try {
            const port = await findFreePort(45700);
            expect(port).not.toBe(45700);
            expect(port).toBeGreaterThan(45700);
        } finally {
            await new Promise<void>(r => server.close(() => r()));
        }
    });

    it('returns preferred + N when N consecutive ports are busy', async () => {
        const servers: net.Server[] = [];
        for (let i = 0; i < 3; i++) {
            const s = net.createServer();
            await new Promise<void>(r => s.listen(45800 + i, '127.0.0.1', r));
            servers.push(s);
        }
        try {
            const port = await findFreePort(45800);
            expect(port).toBeGreaterThanOrEqual(45803);
        } finally {
            await Promise.all(servers.map(s => new Promise<void>(r => s.close(() => r()))));
        }
    });
});
