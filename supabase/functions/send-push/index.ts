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

    // 1. Configuración VAPID (Las llaves deben estar en Secrets)
    const subject = Deno.env.get('VAPID_MAILTO')
    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
    const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')

    if (!subject || !publicKey || !privateKey) {
      throw new Error('Faltan configurar los secretos VAPID en Supabase.')
    }

    webpush.setVapidDetails(subject, publicKey, privateKey)

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

    if (error) throw error
    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ message: 'No subscriptions found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 4. Enviar notificaciones
    const payload = JSON.stringify({ title, body, url })
    const promises = subscriptions.map((sub: any) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      }
      return webpush.sendNotification(pushSubscription, payload)
        .catch((err: any) => {
            if (err.statusCode === 410 || err.statusCode === 404) {
                // La suscripción expiró, borrarla
                console.log(`Borrando suscripción expirada: ${sub.id}`)
                return supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id)
            }
            console.error('Error enviando push:', err)
        })
    })

    await Promise.all(promises)

    return new Response(JSON.stringify({ success: true, count: promises.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})