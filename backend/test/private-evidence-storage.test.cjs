const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EvidenceStorageService,
  EvidenceCategory,
} = require('../dist/modules/evidence-storage/evidence-storage.service.js');

function setup() {
  const parcel = {
    id: 'parcel-123',
    courier_id: 'courier-1',
    recipient_id: 'recipient-1',
    recipient_phone: '+989121234567',
    current_hub_id: null,
    proposed_hub_id: null,
    label_image_ref: null,
    courier_handover_evidence_ref: null,
    hub_receipt_evidence_ref: null,
  };
  const service = new EvidenceStorageService(
    { findOne: async () => parcel },
    { findOne: async () => null },
    { findOne: async () => null },
    { find: async () => [] },
  );
  return { service, parcel };
}

const courier = { sub: 'courier-1', phone: '+989121111111', role: 'COURIER' };

test('private evidence upload rejects a MIME type that does not match the file signature', async () => {
  const { service, parcel } = setup();
  await assert.rejects(
    service.upload(parcel.id, EvidenceCategory.COURIER_HANDOVER, {
      buffer: Buffer.from('not a PNG'),
      mimetype: 'image/png',
      size: 9,
    }, courier),
    (error) => error.status === 400,
  );
});

test('private evidence upload returns an opaque reference and never a public URL', async (t) => {
  const { service, parcel } = setup();
  const previousFetch = global.fetch;
  const previousUrl = process.env.SUPABASE_URL;
  const previousBucket = process.env.SUPABASE_STORAGE_BUCKET;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  t.after(() => {
    global.fetch = previousFetch;
    for (const [key, value] of [
      ['SUPABASE_URL', previousUrl],
      ['SUPABASE_STORAGE_BUCKET', previousBucket],
      ['SUPABASE_SERVICE_ROLE_KEY', previousKey],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  process.env.SUPABASE_URL = 'https://project-ref.supabase.co';
  process.env.SUPABASE_STORAGE_BUCKET = 'pudo-evidence';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-only-test-secret';
  let requestUrl = '';
  global.fetch = async (url, init) => {
    requestUrl = String(url);
    assert.equal(init.method, 'POST');
    assert.equal(new Headers(init.headers).get('apikey'), 'server-only-test-secret');
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer server-only-test-secret');
    return new Response(JSON.stringify({ Key: 'test-object' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const result = await service.upload(parcel.id, EvidenceCategory.COURIER_HANDOVER, {
    buffer: png,
    mimetype: 'image/png',
    size: png.length,
  }, courier);

  assert.match(requestUrl, /\/storage\/v1\/object\/pudo-evidence\/parcels\/parcel-123\/courier_handover\//);
  assert.match(result.evidence_ref, /^pudo-evidence:\/\/parcels\/parcel-123\/courier_handover\/[0-9a-f-]+\.png$/);
  assert.equal('public_url' in result, false);
});

test('signed URL creation refuses evidence not attached to the requested parcel', async () => {
  const { service, parcel } = setup();
  await assert.rejects(
    service.createSignedUrl(parcel.id, 'pudo-evidence://parcels/parcel-123/courier_handover/random.png', courier),
    (error) => error.status === 404,
  );
});

test('a different courier cannot upload evidence for another courier parcel', async () => {
  const { service, parcel } = setup();
  await assert.rejects(
    service.upload(parcel.id, EvidenceCategory.COURIER_HANDOVER, {
      buffer: Buffer.from([255, 216, 255]),
      mimetype: 'image/jpeg',
      size: 3,
    }, { ...courier, sub: 'courier-elsewhere' }),
    (error) => error.status === 403,
  );
});
