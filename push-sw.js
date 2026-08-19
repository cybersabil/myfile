/* CYBERSABIL_PUSH_SERVICE_WORKER_V1_1_AUTO_CLOSE */
importScripts('./push-common.js?v=push1');

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}

  if (data.type === 'number-match') {
    const choices = Array.isArray(data.choices) ? data.choices.map(Number) : [];
    const max = Number(Notification.maxActions || 0);
    const actions = max >= choices.length && choices.length === 3
      ? choices.map(n => ({ action: `pick:${n}`, title: String(n) }))
      : [];

    event.waitUntil(
      self.registration.showNotification(data.title || 'CyberSabil Sign-in', {
        body: actions.length === 3
          ? 'Computer par dikh raha number choose karein.'
          : 'Tap karke computer par dikh raha number match karein.',
        tag: `cybersabil-login-${String(data.challengeId || '').slice(0, 18)}`,
        requireInteraction: true,
        renotify: true,
        data: {
          type: 'number-match',
          challengeId: String(data.challengeId || ''),
          choices,
          expiresAt: Number(data.expiresAt || 0),
        },
        actions,
      })
    );
    return;
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'CyberSabil', {
      body: data.body || 'Phone notifications are enabled.',
      tag: 'cybersabil-push-status',
      data: { type: data.type || 'info' },
    })
  );
});

async function directApprove(challengeId, choice) {
  return self.CyberPushCommon.signedFetch('/auth/push/approve', {
    challengeId,
    choice,
  });
}

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const data = event.notification.data || {};
  if (data.type !== 'number-match') return;

  const expiresAt = Number(data.expiresAt || 0);
  const nowSec = Math.floor(Date.now() / 1000);

  if (expiresAt && nowSec > expiresAt) {
    event.waitUntil(
      self.registration.showNotification(
        'CyberSabil — Request expired',
        {
          body: 'Ye sign-in request expire ho chuki hai.',
          tag: 'cybersabil-approval-result',
        }
      )
    );
    return;
  }

  const picked = String(event.action || '');
  if (picked.startsWith('pick:')) {
    const choice = Number(picked.slice(5));
    event.waitUntil(
      directApprove(data.challengeId, choice)
        .then(result => self.registration.showNotification(
          result.approved ? 'CyberSabil — Approved' : 'CyberSabil — Denied',
          {
            body: result.approved
              ? 'Sign-in approved. Computer login complete ho jayega.'
              : 'Wrong number selected. Sign-in request denied.',
            tag: 'cybersabil-approval-result',
          }
        ))
        .catch(() => self.registration.showNotification('CyberSabil', {
          body: 'Approval request expired or could not be verified.',
          tag: 'cybersabil-approval-result',
        }))
    );
    return;
  }

  const params = new URLSearchParams();
  params.set('c', String(data.challengeId || ''));
  params.set('n', (Array.isArray(data.choices) ? data.choices : []).join(','));
  params.set('e', String(data.expiresAt || 0));
  const url = new URL('./push-approve.html', self.registration.scope);
  url.hash = params.toString();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(async list => {
        // Reuse ONLY an existing approval page. Do not hijack an arbitrary
        // CyberSabil/MyFile tab. A newly-opened approval window is much more
        // likely to be eligible for window.close() after success/expiry.
        for (const client of list) {
          try {
            const current = new URL(client.url);
            if (
              current.pathname.endsWith('/push-approve.html') &&
              'navigate' in client
            ) {
              await client.navigate(url.href);
              return client.focus();
            }
          } catch {}
        }

        return self.clients.openWindow(url.href);
      })
  );
});

self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil((async () => {
    try {
      const vapid = await self.CyberPushCommon.getVapidPublic();
      if (!vapid) return;
      const subscription = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: self.CyberPushCommon.b64urlToBytes(vapid),
      });
      await self.CyberPushCommon.signedFetch('/auth/push/device/refresh', {
        subscription: subscription.toJSON(),
      });
    } catch {}
  })());
});
