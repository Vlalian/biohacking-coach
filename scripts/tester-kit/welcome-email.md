# Welcome email for a tester

`scripts/mint-tester.ts` fills `{{name}}`, `{{email}}` and `{{password}}` and files the result
outside every git repo — `../tester-emails/` by default, `TESTER_EMAIL_DIR` to move it — because
the filled copy holds the password. The register beside it, in
`.scratch/showable-version/testers/REGISTER.md`, never does. Mads pastes the section in the
tester's language into Gmail. Both sections must stay; the kit refuses a template missing one.

## en

Subject: Your Biohacking Coach login

Hi {{name}},

Thanks for trying the Coach. Here is your own login — nobody else has it, and what you write
in the app is yours alone.

- Link: https://biohacking-coach-hazel.vercel.app
- Email: {{email}}
- Password: {{password}}

Please change the password the first time you are in: Settings › Profile › Change password.

Your first ten minutes:

1. Sign in and read the consent page. Nothing is processed until you say yes.
2. Answer the onboarding questions. Honest beats impressive; the Coach plans from these.
3. Open Training Plan. The Coach drafts your first week in about half a minute — accept it,
   discuss it, or decline it.
4. Have one conversation in Coach Chat. Ask what you would ask a coach.
5. Open the Feedback Interview (the "Something to say?" hatch) and tell us what you think, in
   your own words. That is the whole point of this round.

If you have a Garmin: Garmin Connect › the activity › Export Original, then "Upload Garmin
file" on the Training Plan. Not required.

Everything you enter is stored for the Coach to read back to you; you can see and delete it
under Privacy & terms (/privacy). Questions or something broken: write to Mads.

## da

Emne: Dit login til Biohacking Coach

Hej {{name}},

Tak fordi du vil prøve Coachen. Her er dit eget login — ingen andre har det, og det, du skriver
i appen, er dit alene.

- Link: https://biohacking-coach-hazel.vercel.app
- E-mail: {{email}}
- Adgangskode: {{password}}

Skift adgangskoden første gang, du er inde: Indstillinger › Profil › Skift adgangskode.

Dine første ti minutter:

1. Log ind og læs samtykkesiden. Intet behandles, før du siger ja.
2. Svar på onboarding-spørgsmålene. Ærligt slår imponerende; Coachen planlægger ud fra dem.
3. Åbn Træningsplan. Coachen laver et udkast til din første uge på cirka et halvt minut —
   accepter det, diskuter det, eller afvis det.
4. Tag én samtale i Coach-chatten. Spørg om det, du ville spørge en coach om.
5. Åbn Feedback-interviewet (lugen "Noget at sige?") og fortæl os, hvad du synes, med dine egne
   ord. Det er hele formålet med denne runde.

Har du en Garmin: Garmin Connect › aktiviteten › Export Original, og så "Upload Garmin-fil" på
Træningsplanen. Ikke et krav.

Alt, du skriver ind, gemmes, så Coachen kan læse det tilbage til dig; du kan se og slette det
under Privatliv & vilkår (/privacy). Spørgsmål, eller noget der driller: skriv til Mads.
