// Vercel serverless function: sends the NBS contact form as an email via Resend.
//
// Env vars needed in Vercel project settings (Settings -> Environment Variables):
//   RESEND_API_KEY      (required) - from resend.com dashboard, after verifying a domain
//   CONTACT_TO_EMAIL    (optional) - defaults to nicosbuiltsolutions@gmail.com
//   CONTACT_FROM_EMAIL  (optional) - must be on a domain verified in Resend,
//                                    e.g. "NBS Website <formulier@jouwdomein.be>"
//                                    falls back to Resend's shared onboarding@resend.dev
//                                    sender if not set (fine for testing, not for production)

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const { naam, tel, email, bericht, website, consent } = req.body || {};

  // Honeypot: real visitors never fill this hidden field. Bots that do get a
  // fake "success" so they don't retry.
  if (website) {
    return res.status(200).json({ ok: true });
  }

  if (!naam || !email || !bericht) {
    return res.status(400).json({ error: 'missing_fields' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'invalid_email' });
  }

  if (!consent) {
    return res.status(400).json({ error: 'consent_required' });
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('Contact form: RESEND_API_KEY is not set in Vercel env vars');
    return res.status(500).json({ error: 'not_configured' });
  }

  const toEmail = process.env.CONTACT_TO_EMAIL || 'nicosbuiltsolutions@gmail.com';
  const fromEmail = process.env.CONTACT_FROM_EMAIL || 'NBS Website <onboarding@resend.dev>';
  const submittedAt = new Date().toISOString();

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        reply_to: email,
        subject: `Nieuwe offerteaanvraag van ${naam}`,
        text: [
          `Naam: ${naam}`,
          `Telefoon: ${tel || '-'}`,
          `Email: ${email}`,
          '',
          'Bericht:',
          bericht,
          '',
          `Toestemming gegevensverwerking: ja, gegeven op ${submittedAt}`
        ].join('\n')
      })
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error('Resend error:', resendRes.status, errText);
      return res.status(502).json({ error: 'send_failed' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Contact form error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
};
