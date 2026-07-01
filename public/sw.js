/* eslint-disable no-restricted-globals */
// Service Worker — handles Web Push notifications for Voyager

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Voyager", body: event.data.text() };
  }

  const options = {
    body: payload.body ?? undefined,
    icon: "/icons/icon-512.png",
    badge: "/icons/icon-512.png",
    data: { link: payload.link ?? "/notifications" },
    tag: payload.tag ?? "voyager-notif",
    renotify: false,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Voyager", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link ?? "/notifications";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.navigate(link);
            return client.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(link);
      })
  );
});