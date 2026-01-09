
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
        throw new Error('Falta el payment_id en el cuerpo de la solicitud.')
    }

    console.log(`🔍 [VerifyPayment] Iniciando verificación para ID: ${payment_id}`);

    const mpAccessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');
    if (!mpAccessToken) throw new Error('MERCADOPAGO_ACCESS_TOKEN no configurado en Secrets.');

    // 1. Consultar API de Mercado Pago
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${payment_id}`, {
      headers: { Authorization: `Bearer ${mpAccessToken}` }
    })
    
    if (!mpResponse.ok) {
        const errText = await mpResponse.text();
        console.error(`❌ Error MP API: ${mpResponse.status} - ${errText}`);
        throw new Error(`Error consultando Mercado Pago: ${mpResponse.statusText}`)
    }
    
    const paymentData = await mpResponse.json()
    console.log(`✅ [VerifyPayment] Estado MP: ${paymentData.status}`);

    if (paymentData.status !== 'approved') {
        throw new Error(`El pago no está aprobado. Estado actual: ${paymentData.status}`)
    }

    // 2. Extraer Metadata con Parsing Defensivo
    // MP a veces devuelve external_reference como string JSON y a veces como objeto si usa SDKs específicos.
    let metadata = paymentData.external_reference;
    
    if (metadata && typeof metadata === 'string') {
        try {
            metadata = JSON.parse(metadata);
        } catch (e) {
            console.error("⚠️ Error parseando metadata string:", e);
            // Si falla el parseo, tal vez no era JSON, seguimos con lo que hay si es posible
        }
    }

    console.log("📦 [VerifyPayment] Metadata recuperada:", JSON.stringify(metadata));

    const { userId, planId } = metadata || {};

    if (!userId || !planId) {
        // Fallback: intentar buscar en 'additional_info' u otros campos si la metadata falló
        throw new Error(`Metadata incompleta (Falta userId o planId). Recibido: ${JSON.stringify(metadata)}`)
    }

    // 3. Inicializar Supabase ADMIN (Bypass RLS)
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

    // 4. Calcular Vencimiento (30 días)
    const now = new Date();
    const expiresAt = new Date();
    expiresAt.setDate(now.getDate() + 30);

    // 5. Actualizar Profile
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ 
        plan_id: planId,
        plan_expires_at: expiresAt.toISOString()
      })
      .eq('id', userId)

    if (updateError) {
        console.error("❌ Error DB Profile Update:", updateError);
        throw new Error(`Error actualizando perfil en base de datos: ${updateError.message}`)
    }

    // 6. Insertar Historial (Idempotencia básica)
    // Verificamos si ya existe un registro con este payment_id para no duplicar si el usuario recarga
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
            console.warn("⚠️ Warning: Error insertando historial (no crítico):", historyError.message);
        }
    } else {
        console.log("ℹ️ Historial ya existente para este pago, saltando inserción.");
    }

    console.log(`🎉 [VerifyPayment] Éxito total. Usuario ${userId} actualizado a plan ${planId}.`);

    return new Response(JSON.stringify({ success: true, planId, userId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
    })

  } catch (error: any) {
    console.error('🚨 [Edge Function Critical Error]:', error.message)
    
    // Retornamos 200 con success: false para que el cliente maneje el error elegantemente
    // en lugar de recibir un 500 genérico.
    return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
