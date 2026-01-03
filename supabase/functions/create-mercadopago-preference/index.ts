
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
    // 1. Inicializar cliente con PRIVATE_SERVICE_ROLE (Llave Maestra Propia)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('PRIVATE_SERVICE_ROLE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { planId, userId, origin } = await req.json()

    if (!planId || !userId) {
      throw new Error('Faltan parámetros requeridos: planId o userId.')
    }

    // 2. Obtener datos del plan (usando admin client seguro)
    const { data: planData, error: planError } = await supabaseAdmin
      .from('subscription_plans')
      .select('nombre, precio')
      .eq('id', planId)
      .single()

    if (planError) {
        console.error("Error DB:", planError)
        throw new Error(`Error al buscar plan: ${planError.message}`)
    }
    
    if (!planData) throw new Error(`El plan con id "${planId}" no existe.`)
    if (planData.precio <= 0) throw new Error('Este plan es gratuito, no requiere pago.')

    const mpAccessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')
    if (!mpAccessToken) {
      throw new Error('MERCADOPAGO_ACCESS_TOKEN no configurado en Supabase Secrets.')
    }

    const baseUrl = origin || Deno.env.get('SITE_URL') || 'http://localhost:5173'
    
    // 3. Crear Preferencia MP
    const preferencePayload = {
      items: [
        {
          id: planId,
          title: `Suscripción Guía Comercial - Plan ${planData.nombre}`,
          description: `Acceso mensual al plan ${planData.nombre}`,
          quantity: 1,
          currency_id: 'ARS',
          unit_price: Number(planData.precio),
        },
      ],
      payer: {
        email: 'test_user_123456@testuser.com',
      },
      back_urls: {
        success: `${baseUrl}/dashboard?status=approved`, 
        failure: `${baseUrl}/pricing?status=failure`,
        pending: `${baseUrl}/pricing?status=pending`,
      },
      auto_return: 'approved',
      external_reference: JSON.stringify({ userId, planId }), 
      statement_descriptor: "GUIA COMERCIAL",
    }

    console.log("Creando preferencia MP...");

    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mpAccessToken}`,
      },
      body: JSON.stringify(preferencePayload),
    })

    if (!mpResponse.ok) {
      const errorData = await mpResponse.json()
      console.error('Error MP:', JSON.stringify(errorData))
      throw new Error(`Mercado Pago API Error: ${mpResponse.statusText}`)
    }

    const responseData = await mpResponse.json()

    return new Response(JSON.stringify({ init_point: responseData.init_point }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error('CRITICAL ERROR:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500, 
    })
  }
})
