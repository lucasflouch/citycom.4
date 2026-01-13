
// @ts-ignore
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore
import webpush from 'https://esm.sh/web-push@3.6.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

declare const Deno: any;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { title, body, url, userIds } = await req.json()
    
    console.log(`📨 [Push] Iniciando envío a ${userIds.length} usuarios. Msg: "${title}"`);

    // 1. Configuración VAPID (Las llaves deben estar en Secrets)
    const subject = Deno.env.get('VAPID_MAILTO')
    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
    const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')

    if (!subject || !publicKey || !privateKey) {
      console.error("❌ Faltan credenciales VAPID en Secrets");
      throw new Error('Configuración VAPID incompleta en el servidor.')
    }

    try {
        webpush.setVapidDetails(subject, publicKey, privateKey)
    } catch (err) {
        console.error("❌ Error configurando VAPID:", err);
        throw err;
    }

    // 2. Conectar a Supabase (Admin)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 3. Obtener suscripciones de los usuarios destino
    const { data: subscriptions, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('*')
      .in('user_id', userIds)

    if (error) {
        console.error("❌ Error leyendo suscripciones:", error);
        throw error
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.warn("⚠️ No se encontraron suscripciones para los usuarios:", userIds);
      return new Response(JSON.stringify({ message: 'No subscriptions found', count: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`✅ Encontradas ${subscriptions.length} suscripciones.`);

    // 4. Enviar notificaciones
    const payload = JSON.stringify({ title, body, url })
    
    const results = await Promise.allSettled(subscriptions.map((sub: any) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      }
      return webpush.sendNotification(pushSubscription, payload)
    }));

    let successCount = 0;
    let failureCount = 0;

    for (const [index, result] of results.entries()) {
        const sub = subscriptions[index];
        if (result.status === 'fulfilled') {
            console.log(`✅ Push enviado a ${sub.id} (Status: ${result.value.statusCode})`);
            successCount++;
        } else {
            const err = result.reason;
            console.error(`❌ Falló push a ${sub.id}:`, err);
            failureCount++;

            if (err.statusCode === 410 || err.statusCode === 404) {
                console.log(`🧹 Eliminando suscripción muerta: ${sub.id}`);
                await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id);
            }
        }
    }

    console.log(`🏁 Resumen: ${successCount} enviados, ${failureCount} fallidos.`);

    return new Response(JSON.stringify({ success: true, sent: successCount, failed: failureCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error("🚨 Error Crítico en Edge Function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
