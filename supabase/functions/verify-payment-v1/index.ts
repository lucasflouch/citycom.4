
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    const { payment_id } = await req.json()

    if (!payment_id) {
        throw new Error('Falta el payment_id.')
    }

    console.log(`[Edge Function] Verificando pago ID: ${payment_id}`);

    const mpAccessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');
    if (!mpAccessToken) throw new Error('MERCADOPAGO_ACCESS_TOKEN no configurado.');

    // 1. Consultar a Mercado Pago
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${payment_id}`, {
      headers: { Authorization: `Bearer ${mpAccessToken}` }
    })
    
    if (!mpResponse.ok) {
        throw new Error(`Error consultando Mercado Pago: ${mpResponse.statusText}`)
    }
    
    const paymentData = await mpResponse.json()

    if (paymentData.status !== 'approved') {
        throw new Error(`El pago no está aprobado. Estado: ${paymentData.status}`)
    }

    // 2. Extraer Metadata
    let metadata = paymentData.external_reference;
    if (typeof metadata === 'string') {
        try {
            metadata = JSON.parse(metadata);
        } catch (e) {
            console.error("Error parsing metadata:", e);
        }
    }

    const { userId, planId } = metadata || {};
    if (!userId || !planId) {
        throw new Error(`Metadata incompleta. Recibido: ${JSON.stringify(metadata)}`)
    }

    // 3. Inicializar Supabase ADMIN
    // CRÍTICO: Usamos SUPABASE_SERVICE_ROLE_KEY para saltar RLS
    // Esto asegura que podemos escribir en 'profiles' y 'subscription_history'
    // sin importar si la sesión del usuario está activa o no en este contexto.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // 4. Actualizar Profile
    const now = new Date();
    const expiresAt = new Date(now.setDate(now.getDate() + 30));

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ 
        plan_id: planId,
        plan_expires_at: expiresAt.toISOString()
      })
      .eq('id', userId)

    if (updateError) {
        throw new Error(`Error actualizando perfil DB: ${updateError.message}`)
    }

    // 5. Insertar Historial (verificando duplicados)
    const { data: existing } = await supabaseAdmin
        .from('subscription_history')
        .select('id')
        .eq('payment_id', String(payment_id))
        .maybeSingle();

    if (!existing) {
        const { error: historyError } = await supabaseAdmin
          .from('subscription_history')
          .insert({
            user_id: userId,
            plan_id: planId,
            amount: paymentData.transaction_amount,
            payment_id: String(payment_id),
            status: 'active',
            start_date: new Date().toISOString(),
            end_date: expiresAt.toISOString()
          })
        
        if (historyError) {
            console.error("Warning: Error insertando historial:", historyError);
        }
    }

    console.log(`[Edge Function] Éxito. Plan ${planId} activado para ${userId}`);

    return new Response(JSON.stringify({ success: true, planId, userId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
    })

  } catch (error: any) {
    console.error('[Edge Function Error]:', error.message)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 200, // Devolvemos 200 para que el frontend pueda leer el error en JSON
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
