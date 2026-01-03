
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

declare const Deno: any;

serve(async (req: Request) => {
  // Manejo de preflight request (CORS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { payment_id } = await req.json()
    if (!payment_id) throw new Error('Falta el payment_id en el cuerpo de la petición')

    console.log(`Verificando pago: ${payment_id}`);

    // 1. Verificar pago con MP DIRECTAMENTE usando el Access Token del servidor
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${payment_id}`, {
      headers: { 
          Authorization: `Bearer ${Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')}` 
      }
    })
    
    if (!mpResponse.ok) {
        console.error("Error MP API Status:", mpResponse.status);
        throw new Error('No se pudo verificar el pago con Mercado Pago.')
    }
    
    const paymentData = await mpResponse.json()

    // Verificamos estado
    if (paymentData.status !== 'approved') {
        throw new Error(`El pago existe pero no está aprobado. Estado: ${paymentData.status}`)
    }

    // 2. Extraer Metadata
    let metadata = paymentData.external_reference;
    
    if (typeof metadata === 'string') {
        try {
            metadata = JSON.parse(metadata);
        } catch (e) {
            console.error("Error parseando external_reference:", metadata);
            throw new Error('La metadata del pago está corrupta.');
        }
    }

    const { userId, planId } = metadata || {};

    if (!userId || !planId) {
        throw new Error('Metadata incompleta: falta userId o planId.')
    }

    // 3. Inicializar Supabase Admin con la LLAVE MAESTRA PRIVADA
    // USAMOS LA NUEVA LLAVE 'PRIVATE_SERVICE_ROLE' QUE CREASTE
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('PRIVATE_SERVICE_ROLE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 4. Calcular nueva fecha de vencimiento (HOY + 30 DÍAS)
    const now = new Date();
    const expiresAt = new Date(now.setDate(now.getDate() + 30));

    // 5. Actualizar Perfil (Plan + Vencimiento)
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ 
        plan_id: planId,
        plan_expires_at: expiresAt.toISOString()
      })
      .eq('id', userId)

    if (updateError) {
        console.error("Error actualizando perfil:", updateError);
        throw new Error(`Error actualizando base de datos: ${updateError.message}`);
    }

    // 6. Verificar si ya existe el historial para no duplicar
    const { data: existingHistory } = await supabaseAdmin
        .from('subscription_history')
        .select('id')
        .eq('payment_id', String(payment_id))
        .maybeSingle();

    if (!existingHistory) {
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
            console.error("Error guardando historial (no crítico):", historyError);
        }
    }

    // 7. Respuesta Exitosa
    return new Response(JSON.stringify({ success: true, planId, expiresAt, userId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
    })

  } catch (error: any) {
    console.error('Error en Verify Payment Function:', error.message)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
