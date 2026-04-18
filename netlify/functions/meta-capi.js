const crypto = require('crypto');

const PIXEL_ID = process.env.META_PIXEL_ID;
const ACCESS_TOKEN = process.env.META_CAPI_ACCESS_TOKEN;
const TEST_EVENT_CODE = process.env.META_TEST_EVENT_CODE; // opcional

const CAPI_URL = `https://graph.facebook.com/v19.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`;

// Hash SHA-256 para datos de usuario (requerido por Meta)
function hash(value) {
  if (!value) return undefined;
  return crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');
}

exports.handler = async (event) => {
  // Solo aceptamos POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  // Validar que tenemos credenciales
  if (!PIXEL_ID || !ACCESS_TOKEN) {
    console.error('Missing META_PIXEL_ID or META_CAPI_ACCESS_TOKEN env vars');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server not configured' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const {
      event_name,
      event_id,
      event_time,
      event_source_url,
      user_data = {},
      custom_data = {}
    } = body;

    if (!event_name || !event_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing event_name or event_id' })
      };
    }

    // Obtener IP del cliente
    const clientIp =
      event.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      event.headers['x-nf-client-connection-ip'] ||
      '';

    // Construir el payload para Meta CAPI
    const eventPayload = {
      event_name,
      event_time: event_time || Math.floor(Date.now() / 1000),
      event_id,
      event_source_url,
      action_source: 'website',
      user_data: {
        client_user_agent: user_data.client_user_agent || event.headers['user-agent'] || '',
        client_ip_address: clientIp,
        fbp: user_data.fbp,
        fbc: user_data.fbc,
        em: user_data.email ? hash(user_data.email) : undefined,
        ph: user_data.phone ? hash(String(user_data.phone).replace(/\D/g, '')) : undefined,
        fn: user_data.first_name ? hash(user_data.first_name) : undefined,
        ln: user_data.last_name ? hash(user_data.last_name) : undefined,
        ct: user_data.city ? hash(user_data.city) : undefined,
        st: user_data.state ? hash(user_data.state) : undefined,
        country: user_data.country ? hash(user_data.country) : hash('mx')
      },
      custom_data
    };

    // Limpiar undefined
    Object.keys(eventPayload.user_data).forEach(
      (k) => eventPayload.user_data[k] === undefined && delete eventPayload.user_data[k]
    );

    const payload = { data: [eventPayload] };

    // Si estamos en modo test, agregar test_event_code
    if (TEST_EVENT_CODE) {
      payload.test_event_code = TEST_EVENT_CODE;
    }

    // Enviar a Meta
    const response = await fetch(CAPI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Meta CAPI error:', result);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'CAPI request failed', details: result })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, events_received: result.events_received })
    };
  } catch (err) {
    console.error('CAPI handler error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
