import { NextResponse } from "next/server";

export async function GET() {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  
  if (!RESEND_API_KEY) {
    return NextResponse.json({ 
      error: "RESEND_API_KEY not configured",
      keyPresent: false 
    }, { status: 500 });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'CC-AQI Flight Log <onboarding@resend.dev>',
        to: ['santvaras92@gmail.com'],
        subject: `Test Email - ${new Date().toISOString()}`,
        html: '<h1>Test desde Railway</h1><p>Si recibes este correo, la configuración de email está funcionando correctamente.</p>',
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      return NextResponse.json({ 
        error: "Error sending email",
        status: response.status,
        details: data,
        keyPresent: true,
        keyPrefix: RESEND_API_KEY.substring(0, 10) + "..."
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      emailId: data.id,
      message: "Email enviado correctamente",
      keyPresent: true,
      keyPrefix: RESEND_API_KEY.substring(0, 10) + "..."
    });
  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message,
      keyPresent: true,
      keyPrefix: RESEND_API_KEY.substring(0, 10) + "..."
    }, { status: 500 });
  }
}
