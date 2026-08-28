# TheStable.ca --- 2026 Yearling Owner Intake & Bucket Planning

## 1. Doel van dit document

Dit document is de start-specificatie voor verdere uitwerking en bouw in
Cursor/Codex.

Het doel is **nog niet** om de definitieve vragenlijst vast te leggen.
Eerst moet de beslisboom inhoudelijk worden uitgewerkt en kritisch
getest. Daarna kan de applicatie worden gebouwd.

De kern van het project:

> TheStable.ca wil vóór de jaarlingenveilingen weten welke participanten
> in 2026 willen investeren, bij welke sales, hoeveel zij ongeveer
> willen besteden en op welke manier zij willen deelnemen. Anthony
> McDonald moet die informatie eenvoudig kunnen analyseren om vóór de
> sales passende ownership buckets samen te stellen en te bepalen
> hoeveel kapitaal/interesse daarvoor aanwezig is.

------------------------------------------------------------------------

## 2. Achtergrond

TheStable.ca heeft ongeveer 900 participanten/owners en beschikt al over
hun e-mailadressen.

Ieder jaar verschillen de wensen van deze owners. Voorbeelden:

-   Sommige owners willen een klein percentage, bijvoorbeeld 1%.
-   Andere owners willen bijvoorbeeld 20%.
-   Sommige owners willen graag deelnemen aan een bucket waarmee
    meerdere paarden worden gekocht.
-   Sommige owners willen juist niet opeens belangen in vier
    verschillende paarden hebben.
-   Sommige owners willen liever één kwalitatief/premium paard.
-   Sommige owners willen alleen specifieke paarden selecteren, vaak
    tijdens of na de sale.
-   Sommige owners kunnen zowel interesse hebben in buckets als in
    specifieke paarden.
-   Voorkeuren kunnen verschillen per sale.
-   Trotter versus pacer kan relevant zijn.
-   Andere voorkeuren moeten nog worden vastgesteld tijdens het
    ontwerpen van de beslisboom.

TheStable werkt vanuit Canada. Voor deze specificatie nemen we als
uitgangspunt dat **alle bedragen in CAD worden weergegeven en
opgeslagen**. Dit moet vóór productie nog bij TheStable worden
bevestigd.

------------------------------------------------------------------------

## 3. Sales voor 2026

De intake moet in één keer de belangstelling voor het volledige
yearling-sale-seizoen verzamelen.

Voorlopig zijn de relevante sales:

1.  Ohio
2.  Lexington
3.  Harrisburg
4.  London

Een participant moet één of meerdere sales kunnen selecteren.

Alleen voor geselecteerde sales worden vervolgvragen getoond.

Voorbeeld:

-   Owner kiest Ohio + Lexington.
-   Owner krijgt vervolgens Ohio-vragen.
-   Daarna Lexington-vragen.
-   Harrisburg en London worden overgeslagen.

------------------------------------------------------------------------

## 4. Belangrijkste businessdoel

Het systeem is **geen gewone enquête**.

De verzamelde informatie moet Anthony helpen om vooraf beslissingen te
nemen over de structuur en omvang van buckets.

Voorbeeld van het soort informatie dat uiteindelijk nuttig kan zijn:

-   Hoeveel owners hebben belangstelling voor Lexington?
-   Hoeveel indicatief kapitaal vertegenwoordigen zij?
-   Hoeveel daarvan is gericht op buckets?
-   Hoeveel is gericht op specifieke paarden?
-   Hoeveel belangstelling is er voor één premium aankoop?
-   Hoeveel belangstelling is er voor value/multiple-horse buckets?
-   Hoeveel owners willen maximaal één paard?
-   Hoeveel owners accepteren 2--3 paarden binnen een bucket?
-   Hoeveel interesse is er in trotters versus pacers?
-   Welke individuele owners zitten achter een bepaalde combinatie van
    voorkeuren?
-   Hoeveel indicatief kapitaal zit achter die groep?

De exacte KPI's worden pas definitief nadat de vragenboom is ontworpen.

------------------------------------------------------------------------

## 5. Bucketconcept

Anthony gebruikt vooraf samengestelde "buckets" om voldoende kapitaal
beschikbaar te hebben voordat hij paarden koopt.

Voorbeelden die zijn genoemd:

### Value / multiple-horse bucket

Bijvoorbeeld:

-   Bucket: CAD 50.000
-   Doel: koopjes/value purchases
-   Anthony koopt hiermee bijvoorbeeld 2--3 paarden.

### Premium bucket

Bijvoorbeeld:

-   Bucket: CAD 100.000
-   Doel: één kwalitatief/premium paard.

Owners kunnen verschillende voorkeuren hebben.

Voorbeelden:

-   Owner A wil graag spreiden over meerdere paarden.
-   Owner B wil liever één premium paard.
-   Owner C wil maximaal twee paarden binnen zijn investering.
-   Owner D wil helemaal niet vooraf in een bucket maar later een
    specifiek paard selecteren.
-   Owner E wil mogelijk beide.

De precieze financiële en juridische werking van buckets valt buiten
deze eerste technische specificatie en moet nog worden bevestigd voordat
formuleringen over "commitment", "beschikbaar budget" of daadwerkelijke
aankoopverplichtingen worden gebruikt.

------------------------------------------------------------------------

## 6. Voorlopige owner-routes

De definitieve beslisboom moet nog worden ontworpen, maar op basis van
de gesprekken bestaan minimaal de volgende routes.

### Route A --- Bucket

Owner wil vooraf deelnemen aan een bucket.

Mogelijke vervolgvariabelen:

-   sale
-   indicatief investeringsbedrag
-   premium / één paard
-   value / meerdere paarden
-   balanced
-   Anthony mag bepalen
-   maximum aantal paarden
-   trotter / pacer / beide
-   gewenste ownershipgrootte of percentage

### Route B --- Specific horse

Owner wil niet noodzakelijk vooraf in een bucket.

Owner wil specifieke paarden kunnen beoordelen/selecteren, bijvoorbeeld
tijdens of na de sale.

Mogelijke vervolgvariabelen:

-   sale
-   indicatief beschikbaar bedrag
-   trotter / pacer / beide
-   gewenste percentage-range
-   eventuele overige paardvoorkeuren

### Route C --- Both

Owner staat open voor zowel:

-   deelname in een bucket;
-   als aanvullende/specifieke paarden.

Deze route moet niet simpelweg als één antwoord worden opgeslagen. De
relevante voorkeuren voor beide routes moeten afzonderlijk kunnen worden
vastgelegd.

### Route D --- Open / Anthony decides

Mogelijk is er een groep owners die Anthony relatief veel vrijheid wil
geven.

Dit moet inhoudelijk nog worden onderzocht voordat deze route definitief
wordt opgenomen.

------------------------------------------------------------------------

## 7. Kritische ontwerpregel: niet te vroeg aannames maken

Tijdens de bouw mogen de voorlopige routes hierboven niet zonder verdere
validatie worden omgezet naar definitieve businesslogica.

Eerst moet worden vastgesteld:

1.  Welke typen owners werkelijk bestaan.
2.  Welke informatie Anthony daadwerkelijk gebruikt om buckets samen te
    stellen.
3.  Welke informatie interessant klinkt maar operationeel niet nodig is.
4.  Welke vragen owners eenduidig kunnen beantwoorden.
5.  Welke gegevens per sale anders kunnen zijn.
6.  Welke antwoorden indicatief zijn versus daadwerkelijk commitment
    betekenen.

Als iets niet duidelijk is: **vragen, niet aannemen**.

------------------------------------------------------------------------

## 8. Voorlopige beslisboom op hoofdlijnen

Dit is uitsluitend het framework dat verder moet worden uitgewerkt.

### Start

**Q1. Is de participant geïnteresseerd in het kopen van yearling shares
in 2026?**

Voorlopige routes:

-   Ja
-   Nee

Bij Nee kan de intake vrijwel direct eindigen.

### Sale selection

**Q2. Voor welke sales bestaat interesse?**

Multi-select:

-   Ohio
-   Lexington
-   Harrisburg
-   London
-   eventueel: open voor iedere sale
-   eventueel: nog niet zeker

De laatste twee opties moeten nog worden beoordeeld.

### Per geselecteerde sale

Voor iedere gekozen sale wordt een eigen sectie doorlopen.

Voorbeeld:

> Let's talk about Ohio.

Vervolgens moeten minimaal deze onderwerpen worden onderzocht:

1.  Hoeveel wil deze owner bij deze sale ongeveer investeren?
2.  Bucket / specific horse / beide?
3.  Indien bucket: welk type strategie?
4.  Hoeveel paarden maximaal?
5.  Trotter / pacer / beide?
6.  Ownershippercentage of andere maat voor gewenste participatie?
7.  Eventuele aanvullende voorkeuren.

Daarna volgende geselecteerde sale.

### Summary

Aan het einde krijgt de owner een overzicht van de ingevoerde voorkeuren
per sale.

Voorbeeldconcept:

``` text
Ohio
CAD 5,000
Bucket — Value / Multiple horses
Trotter
Maximum 3 horses

Lexington
CAD 8,000
Bucket — Premium
Trotter
Maximum 1 horse

London
CAD 4,000
Specific horse(s)
Pacer
```

Owner kan vóór verzenden teruggaan en wijzigen.

------------------------------------------------------------------------

## 9. Openstaande inhoudelijke vragen

Deze moeten vóór of tijdens het uitwerken van de definitieve beslisboom
worden opgelost.

### 9.1 Budget

Wat moet exact worden gevraagd?

Niet automatisch aannemen dat "budget" voldoende duidelijk is.

Mogelijke betekenissen:

-   totaal dat owner dit sale-seizoen wil investeren;
-   bedrag per sale;
-   bedrag voor buckets;
-   bedrag voor specifieke paarden;
-   maximaal bedrag;
-   waarschijnlijk bedrag;
-   daadwerkelijk vooraf te committeren bedrag.

Waarschijnlijk moet budget **per sale** worden vastgelegd, maar dit moet
nog worden bevestigd.

### 9.2 Percentage ownership

Owners kunnen vanaf circa 1% kopen en sommigen willen bijvoorbeeld 20%.

Nog te bepalen:

-   vragen we gewenst percentage?
-   minimum?
-   maximum?
-   range?
-   bedrag in CAD?
-   is percentage afhankelijk van de aankoopprijs van het paard?

Dit moet eerst inhoudelijk worden onderzocht.

### 9.3 Maximum aantal paarden

Belangrijk vanwege bucketconstructies.

Voorbeeldopties kunnen zijn:

-   maximaal 1
-   maximaal 2
-   maximaal 3
-   4+
-   geen voorkeur

Maar ook dit moet worden gevalideerd.

### 9.4 Premium versus value

Nog te bepalen hoe we dit begrijpelijk formuleren.

Mogelijke concepten:

-   één premium yearling;
-   meerdere value yearlings;
-   balanced;
-   geen voorkeur / Anthony decides.

De termen moeten aansluiten op taal die TheStable zelf gebruikt.

### 9.5 Horse preferences

Trotter / pacer is bekend als relevante variabele.

Nog te bepalen of ook nodig zijn:

-   colt / filly
-   jurisdiction/stakes eligibility
-   sire
-   pedigree
-   prijsniveau
-   andere kenmerken

Alleen toevoegen wanneer Anthony deze informatie daadwerkelijk gebruikt.

------------------------------------------------------------------------

## 10. Owner user experience

De owner moet geen klassieke lange survey zien.

Voorkeur: een eenvoudige, mobielvriendelijke wizard.

### Scherm 1 --- Welcome

TheStable.ca branding/logo.

Voorbeeld:

> 2026 Yearling Sale Planning\
> Help Anthony plan this year's yearling purchases and ownership
> opportunities for Ohio, Lexington, Harrisburg and London.

Indicatie invultijd kan worden toegevoegd zodra de vragenlijst
definitief is.

CTA:

> Let's Get Started

### Scherm 2 --- Select sales

Checkboxes voor de vier sales.

### Scherm 3+ --- Sale-specific flow

Bijvoorbeeld:

> Let's talk about Ohio.

Daaronder alleen relevante vragen.

Conditional logic bepaalt welke vragen worden getoond.

### Laatste scherm --- Review

Owner ziet alle gekozen sales en voorkeuren.

Mogelijkheid om terug te gaan en te wijzigen.

### Confirmation

Bevestiging dat antwoorden succesvol zijn opgeslagen.

------------------------------------------------------------------------

## 11. E-mailflow

TheStable heeft al een eigen mailingplatform.

Daarom hoeft deze applicatie **geen volledig e-mailmarketingplatform**
te bevatten.

TheStable verstuurt zelf de uitnodiging naar ongeveer 900 participanten.

De mail bevat een CTA/link, bijvoorbeeld:

> Complete your 2026 Yearling Preferences

Voorkeur voor een persoonlijke link wanneer het bestaande
mailingplatform dit ondersteunt.

Bijvoorbeeld conceptueel:

``` text
https://yearlings.example.com/i/<random-token>
```

Gebruik geen e-mailadres als zichtbaar identifier in de URL.

Indien gepersonaliseerde links niet eenvoudig mogelijk zijn, kan de
intake naam/e-mailadres uitvragen. Persoonlijke tokens hebben echter de
voorkeur.

------------------------------------------------------------------------

## 12. Identificatie en privacy

Voorkeur:

-   iedere owner heeft intern een unieke owner ID;
-   persoonlijke URL gebruikt een willekeurige, niet-voorspelbare token;
-   e-mailadres staat niet zichtbaar in de URL;
-   owner hoeft niet opnieuw een account/wachtwoord aan te maken;
-   adminomgeving is wel beveiligd.

Belangrijk bij maatwerk:

Een owner mag nooit door URL-manipulatie responses van andere owners
kunnen bekijken of wijzigen.

------------------------------------------------------------------------

## 13. Data-opslag

Data moet **gestructureerd** worden opgeslagen zodat later analyse
mogelijk is.

Niet doen:

``` text
preferences = "Lexington, trotter, premium, 5000..."
```

Wel afzonderlijke velden/tabellen gebruiken.

### Voorlopig conceptueel datamodel

#### owners

``` text
id
external_owner_id (optioneel)
name
email
access_token
created_at
```

#### campaigns

Hiermee kan het systeem later opnieuw worden gebruikt.

``` text
id
year
name
status
opens_at
closes_at
created_at
```

Voorbeeld:

``` text
2026 Yearling Planning
```

#### sales

``` text
id
campaign_id
code
name
display_order
```

Voorbeelden:

``` text
OHIO
LEXINGTON
HARRISBURG
LONDON
```

#### owner_sale_preferences

Eén record per owner per geselecteerde sale.

Voorlopige velden:

``` text
id
owner_id
sale_id
interested
indicative_budget_cad
participation_type
bucket_strategy
max_horses
gait_preference
notes
created_at
updated_at
```

Dit schema is **nog niet definitief**. Eerst beslisboom ontwerpen.

Mogelijk moeten bucket- en specific-horse-voorkeuren in aparte child
records worden opgeslagen wanneer één owner beide routes kiest.

------------------------------------------------------------------------

## 14. Belangrijke datamodelregel

Ontwerp de database zodanig dat later analyses mogelijk zijn die we nu
nog niet exact hebben bedacht.

Voorbeelden:

``` text
Lexington
AND Trotter
AND Premium
AND Max 1 horse
AND Investment >= CAD 5,000
```

Resultaat moet kunnen tonen:

-   aantal owners;
-   totaal indicatief kapitaal;
-   gemiddelde investering;
-   namen;
-   e-mailadressen;
-   individuele bedragen;
-   andere relevante voorkeuren.

------------------------------------------------------------------------

## 15. Anthony's dashboard

Anthony moet niet door 900 surveyresponses hoeven bladeren.

Hij krijgt een managementdashboard.

### Overview

Mogelijke KPI's:

``` text
617 / 897 responded
Total indicative capital: CAD X
Bucket interest: CAD X
Specific-horse interest: CAD X
```

### Per sale

Voorbeeld:

  ------------------------------------------------------------------------
  Sale             Interested     Indicative         Bucket Specific horse
                       owners        capital                
  ------------ -------------- -------------- -------------- --------------
  Ohio                    ...        CAD ...        CAD ...        CAD ...

  Lexington               ...        CAD ...        CAD ...        CAD ...

  Harrisburg              ...        CAD ...        CAD ...        CAD ...

  London                  ...        CAD ...        CAD ...        CAD ...
  ------------------------------------------------------------------------

### Filters

Voorlopige filtermogelijkheden:

-   Sale
-   Participation type
-   Bucket strategy
-   Gait
-   Maximum horses
-   Minimum investment
-   Maximum investment
-   eventueel andere voorkeuren

### Participant detail

Anthony moet vanuit een segment kunnen doorklikken naar de individuele
owners.

Bijvoorbeeld:

``` text
LEXINGTON
Premium
Trotter
Max 1 horse
Investment >= CAD 5,000
```

Resultaat:

``` text
43 owners
CAD 287,500 indicative capital
```

Daaronder tabel met owners.

### Export

CSV-export is wenselijk zodat data indien nodig verder in Excel/Sheets
kan worden gebruikt.

------------------------------------------------------------------------

## 16. Bucket Builder --- mogelijke latere feature

Een potentieel zeer waardevolle dashboardfunctie is een "Bucket
Builder".

Anthony kiest bijvoorbeeld:

``` text
Sale: Lexington
Strategy: Premium
Gait: Trotter
Max horses: 1
```

Het systeem toont vervolgens:

-   matching owners;
-   indicatief beschikbaar kapitaal;
-   individuele bedragen;
-   eventueel percentage van gewenste bucket dat hiermee gedekt kan
    worden.

Voorbeeld:

``` text
Proposed bucket: CAD 100,000
Matching indicative owner capital: CAD 136,500
Potential coverage: 136.5%
```

LET OP:

Dit mag niet worden gepresenteerd als daadwerkelijk gecommitteerd geld
tenzij de businessregels expliciet bevestigen dat responses bindend
zijn.

------------------------------------------------------------------------

## 17. Technische richtingen die zijn besproken

Twee routes zijn besproken.

### Route 1 --- Tally + Google Sheets

Voordelen:

-   zeer snel;
-   goedkoop/gratis;
-   conditional logic;
-   weinig development.

Nadelen:

-   minder controle;
-   dashboard mogelijk beperkter;
-   branding/UX minder exact;
-   complexe beslisboom kan lastiger worden.

### Route 2 --- Kleine custom app gebouwd met Cursor/Codex

De voorkeur van de opdrachtgever is momenteel **Cursor/Codex**.

Voordelen:

-   volledige controle over UX;
-   TheStable branding;
-   eigen database;
-   precies dashboard;
-   gemakkelijk herbruikbaar;
-   logica volledig op maat.

Voor circa 900 jaarlijkse gebruikers is de technische belasting zeer
klein.

De complexiteit zit vooral in:

-   vragenlogica;
-   correcte datastructuur;
-   analyse;
-   beveiliging;
-   testen.

Niet in schaalbaarheid.

------------------------------------------------------------------------

## 18. Mogelijke technische stack voor custom build

Dit is een voorstel, geen harde eis.

### Frontend

-   Next.js
-   TypeScript
-   responsive/mobile-first
-   eenvoudige component library of eigen UI

### Database/backend

Mogelijkheden:

-   Supabase/Postgres
-   of een andere eenvoudige hosted database

Voor dit volume is vrijwel iedere normale relationele database ruim
voldoende.

### Hosting

Bijvoorbeeld:

-   Vercel

### Authentication

Owner:

-   geen klassiek account nodig;
-   secure personal token link.

Admin:

-   authenticated admin login.

### Analytics

In eerste instantie:

-   SQL/database queries;
-   server-side aggregaties;
-   dashboardcomponenten.

Geen aparte BI-tool nodig.

------------------------------------------------------------------------

## 19. Kostenfilosofie

Dit systeem wordt waarschijnlijk maar één keer per jaar intensief
gebruikt.

Daarom:

-   infrastructuur zo eenvoudig mogelijk;
-   geen onnodige betaalde SaaS-abonnementen;
-   free tiers gebruiken waar praktisch;
-   geen overengineering;
-   wel correcte beveiliging en betrouwbare data-opslag.

Het doel is een professioneel systeem met minimale terugkerende kosten.

------------------------------------------------------------------------

## 20. UI/branding richting

Gewenste stijl gebaseerd op de eerder gemaakte mock-up:

-   TheStable.ca logo;
-   donker navy;
-   goud als accent;
-   veel witruimte;
-   cards;
-   rustige professionele uitstraling;
-   mobielvriendelijke owner wizard;
-   desktopvriendelijk Anthony dashboard.

Owner UI en Anthony UI hebben verschillende doelen:

### Owner

Zo eenvoudig mogelijk.

Eén beslissing per scherm of logisch gegroepeerde vragen.

### Anthony

Informatie-dicht maar overzichtelijk:

-   KPI cards;
-   tabellen;
-   filters;
-   eenvoudige grafieken waar nuttig;
-   doorklikken naar ownerlijsten.

------------------------------------------------------------------------

## 21. Wat NIET gebouwd hoeft te worden voor MVP

Tenzij later expliciet gevraagd:

-   payment processing;
-   volledige CRM;
-   nieuw mailingplatform;
-   uitgebreide accountregistratie voor owners;
-   ingewikkelde permissionstructuur;
-   native mobiele app;
-   AI/ML;
-   automatische biedsoftware;
-   sale catalog integrations;
-   live auction integrations.

Focus:

> Intake → structured data → analysis → bucket planning.

------------------------------------------------------------------------

## 22. Aanpak voor Cursor/Codex

**Niet meteen de hele applicatie genereren.**

Aanbevolen volgorde:

### Fase 1 --- Requirements

1.  Lees dit document volledig.
2.  Maak lijst met openstaande businessvragen.
3.  Ontwerp samen met opdrachtgever de definitieve beslisboom.
4.  Test beslisboom met fictieve owner personas.
5.  Ontwerp definitief datamodel.
6.  Definieer dashboardqueries/KPI's.

### Fase 2 --- Prototype

1.  Maak wireframe owner flow.
2.  Maak wireframe Anthony dashboard.
3.  Laat opdrachtgever beide goedkeuren.
4.  Pas daarna database/API implementeren.

### Fase 3 --- Build

1.  Database migrations/schema.
2.  Owner import.
3.  Token-based access.
4.  Multi-step intake.
5.  Autosave.
6.  Summary/confirmation.
7.  Admin authentication.
8.  Dashboard.
9.  Filters.
10. Participant detail.
11. CSV export.

### Fase 4 --- Test

Test minimaal:

-   owner kiest slechts één sale;
-   owner kiest alle sales;
-   bucket only;
-   specific horse only;
-   both;
-   max 1 horse;
-   multiple horses;
-   trotter;
-   pacer;
-   beide;
-   lage en hoge bedragen;
-   incomplete session;
-   owner keert later terug;
-   owner wijzigt antwoorden;
-   dubbele submission;
-   ongeldige/geraden token;
-   admin versus public access;
-   mobiele browser.

------------------------------------------------------------------------

## 23. Autosave en wijzigen

Wenselijk gedrag:

-   antwoorden worden tijdens het doorlopen opgeslagen;
-   browser sluiten leidt niet tot verlies van alles;
-   owner kan via dezelfde persoonlijke link terugkomen;
-   antwoorden kunnen worden gewijzigd zolang de campagne open is;
-   `updated_at` wordt opgeslagen;
-   dashboard reflecteert de meest recente geldige voorkeuren.

Eventueel later audit/history toevoegen indien nodig.

------------------------------------------------------------------------

## 24. Owner import

TheStable beschikt al over e-mailadressen van circa 900 participanten.

Praktische aanpak:

-   import via CSV;
-   minimaal naam + e-mail;
-   optioneel bestaande owner ID;
-   systeem genereert random access token;
-   exporteer mailinglijst met persoonlijke URL indien mailingplatform
    personalisatie ondersteunt.

Voorbeeld export:

``` text
owner_id,name,email,intake_url
1234,John Smith,john@example.com,https://.../i/<token>
```

Als het mailingplatform geen unieke links ondersteunt, moet een fallback
worden ontworpen.

------------------------------------------------------------------------

## 25. Data quality

Validatie moet minimaal omvatten:

-   CAD-bedragen numeriek;
-   geen negatieve bedragen;
-   verplichte velden alleen verplicht wanneer betreffende branch actief
    is;
-   verborgen branches mogen geen oude/stale antwoorden blijven
    meetellen;
-   duidelijke onderscheidingen tussen "geen voorkeur", "niet
    geïnteresseerd" en "nog niet zeker";
-   wijzigingen moeten dashboardaggregaties correct aanpassen.

------------------------------------------------------------------------

## 26. Kritische waarschuwingen

### 26.1 Indicatief versus commitment

Nooit automatisch aannemen dat een opgegeven bedrag daadwerkelijk
gecommitteerd geld is.

Terminologie moet met TheStable worden afgestemd.

### 26.2 Percentage versus budget

Een gewenst ownershippercentage kan afhangen van de aankoopprijs.

Niet zonder onderzoek aannemen dat één percentageveld voldoende is.

### 26.3 Multiple horses

Een owner die "bucket" kiest wil niet automatisch belangen in onbeperkt
veel paarden.

Maximum aantal paarden kan essentieel zijn.

### 26.4 Sale-specific preferences

Niet aannemen dat een owner voor iedere sale dezelfde voorkeur heeft.

### 26.5 Overvragen

Iedere extra vraag verlaagt de gebruiksvriendelijkheid.

Alleen informatie vragen die Anthony daadwerkelijk nodig heeft.

------------------------------------------------------------------------

## 27. Succescriteria

Het systeem is succesvol wanneer Anthony vóór een sale eenvoudig kan
beantwoorden:

> Wie wil hier deelnemen?

> Hoeveel indicatief kapitaal zit daarachter?

> Wie wil buckets versus specifieke paarden?

> Welke bucketstrategieën worden gewenst?

> Hoeveel owners willen één premium paard versus spreiding?

> Hoeveel paarden accepteren zij maximaal?

> Welke gait(s) willen zij?

> Welke individuele owners vormen een logische doelgroep voor een
> mogelijke bucket?

En hij dit kan doen zonder handmatig honderden responses te lezen.

------------------------------------------------------------------------

## 28. Eerstvolgende opdracht voor Codex/Cursor

**Bouw nog niets definitiefs.**

Begin met:

1.  Analyseer deze specificatie.
2.  Identificeer ambiguïteiten en ontbrekende businessregels.
3.  Ontwerp een eerste volledige beslisboom voor de owner intake.
4.  Geef per vraag:
    -   exacte functie van de vraag;
    -   antwoordtype;
    -   antwoordopties;
    -   conditional logic;
    -   databaseveld(en);
    -   waarom Anthony deze data nodig heeft.
5.  Test de boom tegen minimaal zes duidelijk verschillende owner
    personas.
6.  Benoem situaties waarin de huidige informatie onvoldoende is en stel
    daar gerichte vragen over.
7.  Maak daarna pas een voorstel voor het definitieve relationele
    datamodel.

**Belangrijk:** geen aannames of verzonnen businessregels wanneer
informatie ontbreekt. Stel dan een vraag.

------------------------------------------------------------------------

## 29. Samenvatting architectuur

``` text
TheStable existing mailing platform
            |
            v
Personal intake link
            |
            v
2026 Yearling Planning Wizard
            |
            v
Structured database
            |
            +--------------------+
            |                    |
            v                    v
Owner can update          Anthony Dashboard
responses                       |
                                +--> Overview
                                +--> Per Sale
                                +--> Bucket Analysis
                                +--> Filters
                                +--> Owner Lists
                                +--> CSV Export
```

------------------------------------------------------------------------

## Status

**Concept / requirements discovery**

De technische richting is duidelijk genoeg om verder te ontwerpen, maar
de definitieve vragenboom en businessregels zijn nog niet vastgesteld.

De volgende stap is daarom **beslisboom + datamodel**, niet direct
productiecode.
