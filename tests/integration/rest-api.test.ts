/**
 * Integration tests — Rovant REST API
 *
 * These mount the REAL contribution. `new RovantRestContribution().configure(app)`
 * registers every route on a real Express app; the server is started on an
 * ephemeral port and exercised over HTTP.
 *
 * The previous version of this file built its own Express app and re-declared
 * each route by hand. It passed no matter what the real handler did, which is
 * exactly how a broken endpoint could ship.
 */
import * as express from 'express';
import * as http from 'http';
import { AddressInfo } from 'net';

import { RovantRestContribution } from '../../o1-extension/src/node/rovant-rest-contribution';

interface Harness {
    base: string;
    close: () => Promise<void>;
}

/** Boot the contribution's own routes on a random free port. */
async function startRealServer(): Promise<Harness> {
    const app = express.default();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new RovantRestContribution().configure(app as any);

    const server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    return {
        base: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>(resolve => server.close(() => resolve())),
    };
}

async function getJson(url: string): Promise<{ status: number; body: any }> {
    const res = await fetch(url);
    const text = await res.text();
    let body: any = text;
    try { body = JSON.parse(text); } catch { /* keep raw text */ }
    return { status: res.status, body };
}

describe('RovantRestContribution (mounted for real)', () => {
    let h: Harness;

    beforeAll(async () => { h = await startRealServer(); });
    afterAll(async () => { await h.close(); });

    it('GET /rovant/health responds 200 with status ok', async () => {
        const { status, body } = await getJson(`${h.base}/rovant/health`);
        expect(status).toBe(200);
        expect(body.status).toBe('ok');
        expect(typeof body.ts).toBe('number');
    });

    it('GET /rovant/check returns an array of tool results', async () => {
        const { status, body } = await getJson(`${h.base}/rovant/check`);
        expect(status).toBe(200);
        expect(Array.isArray(body)).toBe(true);
        expect(body.length).toBeGreaterThan(0);
        for (const row of body) {
            expect(typeof row.id).toBe('string');
            expect(typeof row.found).toBe('boolean');
            expect(typeof row.version).toBe('string');
        }
    }, 60_000);

    it('GET /rovant/check/:id returns a single result', async () => {
        const { status, body } = await getJson(`${h.base}/rovant/check/git`);
        expect(status).toBe(200);
        expect(body.id).toBe('git');
    }, 30_000);

    it('GET /rovant/xacro-expand rejects a path outside the workspace with 403', async () => {
        const { status } = await getJson(
            `${h.base}/rovant/xacro-expand?path=${encodeURIComponent('/etc/passwd')}`
        );
        expect(status).toBe(403);
    });

    it('GET /rovant/xacro-expand without a path returns 400', async () => {
        const { status } = await getJson(`${h.base}/rovant/xacro-expand`);
        expect(status).toBe(400);
    });

    it('the legacy /o1 prefix is no longer served', async () => {
        const { status } = await getJson(`${h.base}/o1/health`);
        expect(status).toBe(404);
    });

    it('the API token middleware rejects a wrong bearer when IDE_API_TOKEN is set', async () => {
        const previous = process.env['IDE_API_TOKEN'];
        process.env['IDE_API_TOKEN'] = 'secret-token';

        const guarded = await startRealServer();
        try {
            const unauth = await getJson(`${guarded.base}/rovant/health`);
            expect(unauth.status).toBe(401);

            const res = await fetch(`${guarded.base}/rovant/health`, {
                headers: { authorization: 'Bearer secret-token' },
            });
            expect(res.status).toBe(200);
        } finally {
            await guarded.close();
            if (previous === undefined) delete process.env['IDE_API_TOKEN'];
            else process.env['IDE_API_TOKEN'] = previous;
        }
    });
});
