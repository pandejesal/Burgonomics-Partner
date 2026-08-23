/**
 * Netlify Function: petpooja-callback.ts
 * Webhook handler receiving status updates from Petpooja POS (1: accepted, 2: preparing, 3: ready, 4: cancelled).
 */
import type { Handler } from '@netlify/functions';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const { order_id, order_status } = payload;

    if (!order_id || !order_status) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing order_id or order_status in callback' }),
      };
    }

    const statusMap: Record<string, string> = {
      '1': 'accepted',
      '2': 'preparing',
      '3': 'ready',
      '4': 'cancelled',
    };

    const mappedStatus = statusMap[String(order_status)] || 'preparing';

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        petpoojaOrderId: order_id,
        newStatus: mappedStatus,
        receivedAt: new Date().toISOString(),
      }),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message || 'Callback Processing Error' }),
    };
  }
};
