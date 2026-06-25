
# Travel Journal & Planner — Piano

## Cosa costruisco

Una web app PWA installabile su Mac/iPhone/iPad (dal browser → "Aggiungi a Home") con login personale e sync. Lingue: IT, EN, FR, DE, ES, PT, ZH, KO, JA con selettore.

## Funzionalità v1

**Viaggi (storico + pianificazione futura)**
- Lista viaggi con stato auto: passato / in corso / pianificato (in base alle date)
- Dettagli viaggio: titolo, paese/i, città, date inizio/fine, valuta locale, nota
- Tab "Storico" e tab "In programma"

**Itinerario — vista Timeline a righe**
- Prima riga = viaggio di andata, ultima = viaggio di ritorno
- Righe intermedie configurabili come **per giornate** (una riga per giorno) o **per attività** (raggruppate per tipo)
- Ogni elemento itinerario ha: tipo (volo, treno, auto/autostrada, traghetto, alloggio, attività, zona visitata, spostamento), titolo, luogo, data+ora inizio/fine, note, costo opzionale collegato a una spesa

**Spese**
- Categorie: Spostamenti, Alloggi, Cibo, Souvenir, Attività, Altro
- Importo, valuta originale + conversione automatica nella valuta home
- Filtro per viaggio, categoria, periodo; totali e split per categoria con barre
- Collegabili a un elemento dell'itinerario

**Cambio valuta live**
- Header con tasso sempre visibile: 1 [home] → X [locale viaggio attivo]
- API gratuita `exchangerate.host` (no key) con cache 6h; fallback al tasso manuale per viaggio se offline
- Convertitore rapido in alto

**Multilingua**
- Selettore lingua in alto, persistenza per utente
- i18n con react-i18next, 9 locali (chiavi tradotte per UI; i contenuti dell'utente restano nella sua lingua)

**Account**
- Login email/password (Lovable Cloud)
- Dati privati per utente con RLS

## Design

- Minimal, elegante, sensazione da "diario di viaggio moderno"
- Palette calda neutra: sabbia chiaro, terra cotta come accento, verde salvia secondario; tipografia sans serif geometrica (Outfit) + accenti serif (Fraunces) per titoli viaggio
- Cards con bordi morbidi, ombre leggere, timeline con linea verticale e pallini colorati per tipo evento
- Icone Lucide. Dark mode no (come da regola progetto)

## Struttura tecnica

```text
src/routes/
  index.tsx                    → landing/redirect (auth → /trips, no auth → /auth)
  auth.tsx                     → login/signup
  _authenticated/
    trips.tsx                  → lista viaggi (storico + futuri)
    trips.new.tsx              → crea viaggio
    trips.$tripId.tsx          → layout viaggio (header + tabs)
    trips.$tripId.index.tsx    → overview
    trips.$tripId.timeline.tsx → vista timeline a righe
    trips.$tripId.expenses.tsx → spese
    settings.tsx               → lingua, valuta home
```

**DB (Lovable Cloud)**
- `profiles` (id→auth.users, home_currency, language)
- `trips` (id, user_id, title, country, city, start_date, end_date, local_currency, fx_rate_fallback, notes, timeline_mode)
- `itinerary_items` (id, trip_id, kind, title, location, start_at, end_at, day_index, notes, position)
- `expenses` (id, trip_id, itinerary_item_id?, category, amount, currency, amount_home, date, note)
- RLS: ogni tabella scoped a `auth.uid()` via `user_id` o `trip_id`

**Server**
- `createServerFn` per CRUD viaggi/itinerario/spese (con `requireSupabaseAuth`)
- `createServerFn` per fetch tassi di cambio con cache server-side

**PWA**
- Manifest + icone, `display: standalone`, theme color
- Solo manifest (no offline service worker in v1)

## Cosa NON faccio in v1 (per tenere la v1 spedibile)
- Mappe interattive, export PDF, condivisione viaggi, foto/gallerie, notifiche, app nativa Capacitor, OCR scontrini, integrazione calendari esterni. Possiamo aggiungerli dopo.

Conferma e procedo con setup Lovable Cloud + costruzione completa.
