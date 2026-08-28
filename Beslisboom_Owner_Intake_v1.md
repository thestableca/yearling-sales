# TheStable.ca 2026 Yearling Owner Intake - Beslisboom V1

Status: werkversie voor inhoudelijke bespreking. Nog geen definitieve businesslogica.

Doel van deze beslisboom:

- owners zo weinig mogelijk laten invullen;
- alleen vragen stellen die Anthony nodig heeft voor planning;
- voorkeuren per sale apart vastleggen;
- bucket-interesse en specific-horse-interesse gescheiden kunnen analyseren;
- duidelijk onderscheid houden tussen indicatieve interesse en commitment.

## 1. Hoofdroute

### Q1 - Wil je in 2026 mogelijk deelnemen aan yearling ownership?

Functie:
Vroeg bepalen of de owner relevant is voor de intake.

Antwoordtype:
Single choice.

Opties:

- Ja, ik ben geinteresseerd
- Misschien / ik weet het nog niet
- Nee, dit jaar niet

Conditional logic:

- Ja: ga naar Q2.
- Misschien: ga naar Q2, maar markeer algemene status als onzeker.
- Nee: ga naar afsluiting met optionele notitie.

Databasevelden:

- campaign_response.overall_interest_status
- campaign_response.general_notes optioneel

Waarom Anthony dit nodig heeft:
Om respons te scheiden tussen actieve interesse, mogelijke interesse en geen interesse.

Open punt:
Moet "misschien" meegenomen worden in kapitaalanalyses, of alleen apart zichtbaar zijn?

## 2. Sale-selectie

### Q2 - Voor welke 2026 sales wil je je interesse doorgeven?

Functie:
Bepalen voor welke sales vervolgvragen nodig zijn.

Antwoordtype:
Multi-select.

Opties:

- Ohio
- Lexington
- Harrisburg
- London
- Ik sta open voor iedere sale
- Nog niet zeker

Conditional logic:

- Voor elke specifieke gekozen sale wordt een sale-specifieke flow gestart.
- "Open voor iedere sale" kan automatisch alle sales activeren, maar moet als aparte intentie bewaard blijven.
- "Nog niet zeker" toont eventueel een compacte algemene flow, of vraagt alsnog per sale onzekerheid.

Databasevelden:

- owner_sale_preferences.sale_id
- owner_sale_preferences.interested
- owner_sale_preferences.interest_certainty
- campaign_response.open_to_any_sale

Waarom Anthony dit nodig heeft:
Alle dashboard- en bucketplanning begint met interesse per sale.

Open punt:
Mag "open voor iedere sale" operationeel hetzelfde betekenen als alle vier sales selecteren, of is dit een aparte flexibele groep?

## 3. Sale-specifieke flow

Deze sectie wordt herhaald voor elke geselecteerde sale.

Voorbeeldkop:
"Let's talk about Lexington."

### Q3 - Hoe zeker is je interesse voor deze sale?

Functie:
Voorkomen dat alle ingevulde bedragen hetzelfde gewicht krijgen.

Antwoordtype:
Single choice.

Opties:

- Waarschijnlijk / serieus geinteresseerd
- Misschien
- Alleen als er een passende mogelijkheid komt

Conditional logic:
Altijd tonen voor geselecteerde sales, tenzij Q1 al "misschien" was en dit dubbel voelt. In dat geval kan deze vraag alsnog nuttig zijn per sale.

Databasevelden:

- owner_sale_preferences.interest_certainty

Waarom Anthony dit nodig heeft:
CAD 10.000 serieuze interesse is niet hetzelfde als CAD 10.000 zeer vrijblijvende interesse.

Open punt:
Welke termen gebruikt TheStable zelf voor deze gradaties?

### Q4 - Welk indicatief bedrag wil je voor deze sale beschikbaar houden?

Functie:
Kapitaal per sale verzamelen.

Antwoordtype:
Currency input in CAD, eventueel met ranges als alternatief.

Opties/input:

- Vrij bedrag in CAD
- Eventueel vooraf ingestelde ranges: under 2,500 / 2,500-5,000 / 5,000-10,000 / 10,000-25,000 / 25,000+

Conditional logic:
Altijd tonen voor een geselecteerde sale, behalve wanneer owner alleen "nog niet zeker" wil registreren zonder bedrag.

Databasevelden:

- owner_sale_preferences.indicative_budget_cad
- owner_sale_preferences.budget_type

Waarom Anthony dit nodig heeft:
Dit is de basis voor alle kapitaal- en bucketanalyses.

Open punt:
Moet dit "indicatief budget", "likely amount", "maximum", of "amount you would consider" heten?

### Q5 - Hoe wil je bij deze sale het liefst deelnemen?

Functie:
Hoofdbranch bepalen: bucket, specifiek paard, beide of Anthony/flexibel.

Antwoordtype:
Single choice, maar "both" leidt tot twee aparte vervolgroutes.

Opties:

- Vooraf deelnemen aan een bucket
- Specifieke paarden beoordelen/selecteren
- Beide
- Anthony mag mij indelen waar het passend is
- Nog niet zeker

Conditional logic:

- Bucket: toon bucket-vragen.
- Specifieke paarden: toon specific-horse-vragen.
- Beide: toon bucket-vragen en specific-horse-vragen apart.
- Anthony beslist: toon minimale voorkeurvragen om zijn ruimte te begrenzen.
- Nog niet zeker: toon alleen kernvoorkeuren.

Databasevelden:

- owner_sale_preferences.participation_type
- bucket_preferences record indien bucket of beide
- specific_horse_preferences record indien specific horse of beide

Waarom Anthony dit nodig heeft:
Een eigenaar die bucketkapitaal beschikbaar stelt is operationeel anders dan iemand die later alleen specifieke paarden wil beoordelen.

Open punt:
Moet "Anthony mag bepalen" een eigen route zijn of alleen een optie binnen bucketstrategie?

## 4. Bucket-route

Toon wanneer Q5 = bucket, beide of Anthony beslist met voldoende flexibiliteit.

### Q6 - Welke bucketstrategie past het beste bij jou?

Functie:
Vraag naar gewenste aankoopfilosofie.

Antwoordtype:
Single choice.

Opties:

- Een premium yearling
- Meerdere value yearlings
- Balanced / open voor beide
- Geen voorkeur, Anthony mag bepalen

Conditional logic:

- Premium suggereert max 1 paard, maar Q7 blijft nodig ter bevestiging.
- Value/balanced toont Q7 nadrukkelijk.

Databasevelden:

- bucket_preferences.strategy

Waarom Anthony dit nodig heeft:
Hiermee kan hij groepen vormen zoals "Lexington premium trotter max 1".

Open punt:
Zijn "premium", "value" en "balanced" de juiste woorden voor owners?

### Q7 - In hoeveel paarden wil je maximaal terechtkomen binnen deze sale/bucket?

Functie:
Grenzen vastleggen voor spreiding.

Antwoordtype:
Single choice.

Opties:

- Maximaal 1
- Maximaal 2
- Maximaal 3
- 4 of meer is akkoord
- Geen voorkeur

Conditional logic:
Tonen voor alle bucket-routes.

Databasevelden:

- bucket_preferences.max_horses

Waarom Anthony dit nodig heeft:
Voorkomt dat een owner onbedoeld in meer paarden terechtkomt dan gewenst.

Open punt:
Moet max horses per sale gelden, per bucket, of voor het hele seizoen?

### Q8 - Welke gait heeft je voorkeur voor deze bucket?

Functie:
Trotter/pacer-voorkeur vastleggen.

Antwoordtype:
Single choice.

Opties:

- Trotter
- Pacer
- Beide
- Geen voorkeur

Conditional logic:
Tonen voor bucket-route.

Databasevelden:

- bucket_preferences.gait_preference

Waarom Anthony dit nodig heeft:
Gait is een directe segmentatiefactor voor aankoopplanning.

Open punt:
Is gait altijd nodig per route, of kan het als sale-brede voorkeur worden gevraagd?

### Q9 - Welk ownershippercentage of welke range zoek je ongeveer binnen een bucket?

Functie:
Voorkeur voor participatiegrootte vastleggen naast CAD-bedrag.

Antwoordtype:
Nog te bepalen: range input, single choice ranges, of optioneel tekstveld.

Conceptopties:

- Rond 1%
- 2-5%
- 5-10%
- 10-20%
- 20%+
- Afhankelijk van paard en prijs
- Geen voorkeur

Conditional logic:
Alleen tonen als TheStable bevestigt dat dit operationeel nuttig is.

Databasevelden:

- bucket_preferences.ownership_min_percent
- bucket_preferences.ownership_max_percent
- bucket_preferences.ownership_flexibility

Waarom Anthony dit nodig heeft:
Sommige owners denken in percentages, maar percentage hangt af van aankoopprijs.

Open punt:
Is percentage leidend, of is CAD-budget voldoende voor planning?

## 5. Specific-horse-route

Toon wanneer Q5 = specifieke paarden of beide.

### Q10 - Wil je specifieke paarden zelf beoordelen voordat je beslist?

Functie:
Bevestigen dat deze owner geen vooraf samengestelde bucket zoekt, of daarnaast losse kansen wil bekijken.

Antwoordtype:
Single choice.

Opties:

- Ja, ik wil specifieke paarden beoordelen
- Ja, maar Anthony mag eerst filteren/selecteren
- Misschien

Conditional logic:
Tonen in specific-horse-route.

Databasevelden:

- specific_horse_preferences.selection_preference

Waarom Anthony dit nodig heeft:
Maakt onderscheid tussen passieve interesse en owners die later actief keuzes willen maken.

Open punt:
Hoe werkt dit proces praktisch tijdens/na de sale?

### Q11 - Welke gait heeft je voorkeur voor specifieke paarden?

Functie:
Voorkeur voor trotter/pacer vastleggen voor losse paarden.

Antwoordtype:
Single choice.

Opties:

- Trotter
- Pacer
- Beide
- Geen voorkeur

Conditional logic:
Tonen in specific-horse-route.

Databasevelden:

- specific_horse_preferences.gait_preference

Waarom Anthony dit nodig heeft:
Ook buiten buckets moet Anthony weten welke paarden relevant zijn voor deze owner.

Open punt:
Mag deze voorkeur verschillen van de bucket-gait? Waarschijnlijk ja, dus apart opslaan.

### Q12 - Naar welk ownershippercentage of welke deelnamegrootte kijk je bij specifieke paarden?

Functie:
Grootte van mogelijke losse deelname vastleggen.

Antwoordtype:
Nog te bepalen: percentage range, CAD per horse, of beide.

Conceptopties:

- Rond 1%
- 2-5%
- 5-10%
- 10-20%
- 20%+
- Afhankelijk van paard en prijs
- Geen voorkeur

Conditional logic:
Alleen tonen als TheStable bevestigt dat Anthony dit echt gebruikt.

Databasevelden:

- specific_horse_preferences.ownership_min_percent
- specific_horse_preferences.ownership_max_percent
- specific_horse_preferences.amount_per_horse_cad optioneel

Waarom Anthony dit nodig heeft:
Een owner met CAD 10.000 kan heel anders passen bij een duur premium paard dan bij een value aankoop.

Open punt:
Moeten we naast totaalbudget ook "max per horse" vragen?

### Q13 - Zijn er specifieke paardvoorkeuren die belangrijk zijn?

Functie:
Ruimte geven voor relevante voorkeuren zonder de wizard te zwaar te maken.

Antwoordtype:
Optionele multi-select plus notitie, alleen als TheStable deze data wil gebruiken.

Conceptopties:

- Colt
- Filly
- Stakes eligibility / jurisdiction
- Pedigree / sire
- Prijsniveau
- Geen specifieke voorkeur
- Anders, namelijk...

Conditional logic:
Niet standaard opnemen tenzij Anthony bevestigt dat hij hierop segmenteert.

Databasevelden:

- specific_horse_preferences.sex_preference
- specific_horse_preferences.jurisdiction_preference
- specific_horse_preferences.pedigree_notes
- specific_horse_preferences.price_level_preference
- specific_horse_preferences.notes

Waarom Anthony dit nodig heeft:
Alleen nuttig als deze voorkeuren aankoopcommunicatie of segmentatie daadwerkelijk sturen.

Open punt:
Welke paardkenmerken gebruikt Anthony echt vooraf?

## 6. Flexibele route: Anthony decides

Toon wanneer Q5 = Anthony mag mij indelen waar het passend is.

### Q14 - Hoeveel vrijheid mag Anthony gebruiken binnen deze sale?

Functie:
Flexibele owners bruikbaar maken zonder hun grenzen te negeren.

Antwoordtype:
Single choice.

Opties:

- Volledig flexibel binnen mijn opgegeven bedrag
- Flexibel, maar liever bucket
- Flexibel, maar liever specifieke paarden
- Flexibel, maar alleen met mijn gait/max-horses voorkeuren

Conditional logic:
Afhankelijk van antwoord alsnog Q7/Q8 tonen.

Databasevelden:

- owner_sale_preferences.flexibility_level
- owner_sale_preferences.preferred_default_route

Waarom Anthony dit nodig heeft:
Deze groep kan waardevol zijn bij het vullen van buckets, maar moet niet verkeerd worden geinterpreteerd.

Open punt:
Wil TheStable deze route expliciet aanbieden, of maakt dit de intake te vaag?

## 7. Sale-afsluiting

### Q15 - Wil je nog iets toevoegen voor deze sale?

Functie:
Vrije nuance opvangen zonder extra verplichte vragen.

Antwoordtype:
Optionele tekst.

Conditional logic:
Aan het eind van elke sale-flow.

Databasevelden:

- owner_sale_preferences.notes

Waarom Anthony dit nodig heeft:
Sommige relevante voorkeuren passen niet in vaste opties.

Risico:
Vrije tekst is minder analyseerbaar; alleen gebruiken als aanvulling.

## 8. Review en bevestiging

### Q16 - Klopt dit overzicht?

Functie:
Owner kan fouten corrigeren voordat de response definitief wordt gemarkeerd.

Antwoordtype:
Review screen met edit-knoppen per sale.

Conditional logic:

- Edit: terug naar gekozen sale/sectie.
- Confirm: response status naar submitted.

Databasevelden:

- campaign_response.status
- campaign_response.submitted_at
- updated_at velden op voorkeurrecords

Waarom Anthony dit nodig heeft:
Verhoogt datakwaliteit en voorkomt verkeerd geaggregeerde voorkeuren.

## 9. Minimale V1-flow

Als we de intake kort willen houden, is dit de minimale set:

1. Interesse in 2026: ja / misschien / nee.
2. Sales: Ohio / Lexington / Harrisburg / London.
3. Per sale: indicatief CAD-bedrag.
4. Per sale: bucket / specifieke paarden / beide / Anthony beslist / nog niet zeker.
5. Als bucket: premium / value / balanced / Anthony beslist.
6. Als bucket: maximaal aantal paarden.
7. Per relevante route: trotter / pacer / beide / geen voorkeur.
8. Optioneel: percentage/range.
9. Review en submit.

## 10. Belangrijkste businessvragen voor TheStable

1. Is een response indicatieve interesse, zachte commitment, of harde commitment?
2. Moet budget per sale, per route, per horse, of voor het hele seizoen worden gevraagd?
3. Moet "open voor iedere sale" automatisch alle sales activeren?
4. Is "Anthony decides" een nuttige owner-route of te onduidelijk?
5. Welke termen gebruikt TheStable zelf: premium/value/balanced, of andere taal?
6. Is maximum aantal paarden per sale, per bucket, of voor het hele seizoen?
7. Is ownershippercentage nodig voor planning, of leidt dit tot verwarring?
8. Moet gait per sale een algemene vraag zijn, of apart voor bucket en specific-horse?
9. Welke extra paardvoorkeuren gebruikt Anthony echt: colt/filly, jurisdiction, sire, pedigree, prijsniveau?
10. Moeten "misschien" en "alleen als passend" meetellen in totaal kapitaal, apart zichtbaar zijn, of beide?
11. Moeten owners hun antwoorden kunnen wijzigen tot de campagne sluit?
12. Welke exports of dashboardfilters zijn absoluut nodig voor MVP?

## 11. Aanbevolen volgende stap

Bespreek eerst de businessvragen hierboven met Anthony/TheStable. Daarna kunnen we:

1. deze beslisboom aanscherpen;
2. zes testpersonas door de flow laten lopen;
3. controleren of elke dashboard-KPI uit de antwoorden kan worden berekend;
4. pas daarna het relationele datamodel definitief maken.
