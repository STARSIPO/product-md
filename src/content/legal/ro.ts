import { PLACEHOLDER, type LegalContentShape } from './ru'

/**
 * Static/legal content, Romanian.
 *
 * Typed as `typeof ru` (re-exported as `LegalContentShape`), so a missing, renamed or
 * extra key fails `npm run typecheck` instead of rendering a half-translated legal
 * document in production.
 */
export const ro: LegalContentShape = {
  ui: {
    tableOfContents: 'Cuprins',
    onThisPage: 'Pe această pagină',
    placeholderBadge: 'De completat',
    placeholderValue: 'Se completează de proprietarul platformei',
    faqHint: 'Apăsați pe întrebare pentru a deschide răspunsul.',
  },

  // ------------------------------------------------------------------ terms
  terms: {
    title: 'Termeni de utilizare',
    description:
      'Regulile de utilizare a Product.md: rolul platformei, conturi, anunțuri și cereri, oferte sigilate, costul serviciilor platformei, răspunderea părților.',
    updated: '2026-08-05',
    intro:
      'Acești termeni descriu ce face Product.md, ce nu face și ce reguli se aplică tuturor celor care folosesc platforma. Prin înregistrare sau prin publicarea unui anunț sunteți de acord cu ei. Dacă nu sunteți de acord măcar cu un punct, nu folosiți serviciul.',
    sections: [
      {
        heading: '1. Ce este Product.md',
        paragraphs: [
          'Product.md este o platformă informațională pentru comerțul angro cu produse alimentare și mărfuri conexe în Republica Moldova. Oferim furnizorilor un loc în care își pot arăta marfa, iar cumpărătorilor un loc în care pot publica o cerere de achiziție și pot primi oferte.',
          'Platforma nu este parte a contractului de livrare. Nu vindem marfă, nu o cumpărăm, nu acționăm ca comisionar, agent sau intermediar în decontări. Contractul se încheie direct între cumpărător și furnizor, iar toate condițiile lui — preț, calitate, termene, livrare, documente, plată — sunt stabilite de ei.',
          'Nu încasăm plata pentru marfă și nu percepem comision din tranzacție. Banii pentru marfă nu trec niciodată prin Product.md.',
        ],
        list: [
          'Oferim: catalog, cereri de achiziție, oferte comerciale sigilate, chat, profiluri de companii, verificare, moderare și reclamații.',
          'Nu oferim: escrow, garanția plății, garanția livrării, asigurarea mărfii, asistență juridică a tranzacției.',
        ],
      },
      {
        heading: '2. Cine poate folosi platforma',
        paragraphs: [
          'Platforma este destinată mediului de afaceri: persoane juridice, întreprinzători individuali și gospodării țărănești înregistrate conform legii. Creând un cont în numele unei companii, confirmați că sunteți împuternicit să acționați pentru ea.',
          'O persoană reprezintă o singură companie. Contul este personal: datele de acces nu se transmit terților. Toate acțiunile efectuate din contul dumneavoastră sunt considerate ale dumneavoastră până când ne anunțați că ați pierdut accesul.',
          'Putem refuza înregistrarea sau bloca un cont dacă datele companiei sunt neveridice sau dacă acesta este folosit pentru acțiuni interzise de acești termeni.',
        ],
      },
      {
        heading: '3. Profilul companiei și verificarea',
        paragraphs: [
          'Pentru a publica anunțuri și a răspunde la cereri trebuie completat profilul companiei: denumirea juridică, IDNO, contactele, raionul și localitatea, condițiile de livrare și de plată. Datele trebuie să fie actuale — un contact învechit vă dăunează în primul rând dumneavoastră.',
          'Verificarea este voluntară. Puteți confirma telefonul, adresa de e-mail, înregistrarea companiei, IDNO, documentele, autorizațiile ANSA și datele bancare. Verificările confirmate apar pe profilul companiei sub formă de insigne.',
          'Documentele încărcate pentru verificare se păstrează într-un depozit privat. Public se vede doar rezultatul verificării: vizitatorul vede insigna „Documente verificate”, dar nu vede nici fișierul, nici numărul, nici termenul de valabilitate — dacă nu ați activat dumneavoastră publicarea unui document anume.',
        ],
      },
      {
        heading: '4. Anunțuri și cereri de achiziție',
        paragraphs: [
          'Furnizorul publică un anunț despre marfă: denumire, categorie, preț, unitate de măsură, comandă minimă, condiții de livrare. Cumpărătorul publică o cerere de achiziție: ce îi trebuie, cât, unde, până când și ce documente sunt necesare.',
          'Răspundeți pentru conținutul a ceea ce publicați: pentru corectitudinea prețului și a caracteristicilor, pentru dreptul de a vinde marfa respectivă, pentru existența documentelor cerute de lege și pentru drepturile asupra fotografiilor. Nu verificăm manual fiecare anunț înainte de publicare, dar îl putem ascunde dacă încalcă regulile.',
          'Cerințele detaliate privind conținutul sunt adunate într-un document separat — „Reguli de publicare”. El face parte din acești termeni.',
        ],
      },
      {
        heading: '5. Oferte comerciale sigilate',
        paragraphs: [
          'Răspunsul furnizorului la o cerere este o ofertă comercială sigilată. Aceasta este regula-cheie a platformei și nu are excepții: furnizorul vede doar propria ofertă, iar cumpărătorul care a publicat cererea vede toate ofertele primite la ea.',
          'Concurentul nu vede prețul dumneavoastră, condițiile de plată, termenele de livrare și fișierele atașate. Nu îi este accesibilă nici componența participanților — public se afișează doar numărul de oferte primite.',
          'Un furnizor poate depune o singură ofertă la o cerere. Astfel se exclud încercările de a „inunda” cererea cu mai multe cotații din profiluri diferite.',
          'Un moderator sau administrator poate accesa o ofertă doar din necesitate de serviciu — la examinarea unei reclamații sau a unui litigiu, iar fiecare astfel de acces este consemnat în jurnalul de audit.',
        ],
      },
      {
        heading: '6. Tranzacția, decontările și răspunderea',
        paragraphs: [
          'Când cumpărătorul acceptă o ofertă, platforma consemnează tranzacția: părțile, pozițiile, sumele și condițiile convenite. Este o înregistrare internă pentru istoric, recenzii și statistică, nu un contract încheiat de platformă.',
          'Decontările se fac direct între părți: prin transfer, în numerar, cu plată amânată — cum au convenit. Documentele primare (factura fiscală, actul de predare-primire) sunt întocmite de furnizor conform legislației Republicii Moldova.',
          'Pentru calitatea mărfii, conformitatea cu cerințele sanitare, integralitatea documentelor, termenele de livrare și plată răspund părțile tranzacției, nu platforma. Pretențiile privind marfa se adresează furnizorului.',
          'Dacă partenerul a încălcat înțelegerea, anunțați-ne printr-o reclamație: nu compensăm pierderi, dar verificăm compania, putem retrage insignele, o putem suspenda sau bloca și îi putem avertiza pe ceilalți utilizatori.',
        ],
      },
      {
        heading: '7. Costul serviciilor platformei',
        paragraphs: [
          'La lansare publicarea este gratuită pentru toți. Modelul cu plată este activat de administrator atunci când pe platformă se adună suficientă ofertă, iar despre activarea lui anunțăm din timp.',
          'După activare, un anunț activ al furnizorului costă 1 MDL pe zi. Suma nu se reține de pe card, ci din balanța internă a companiei: alimentați balanța printr-o singură plată, iar din ea se scade zilnic costul anunțurilor active.',
          'Cererile cumpărătorilor sunt gratuite întotdeauna — publicarea cererii, primirea și compararea ofertelor nu se tarifează în nicio situație.',
          'Furnizorul nou primește o perioadă de probă gratuită. Când balanța se apropie de zero, sosește un avertisment cu estimarea zilelor rămase. Dacă balanța ajunge totuși la zero, anunțurile se suspendă, nu se șterg: după alimentare afișarea se reia, iar datele anunțului se păstrează.',
        ],
        list: [
          'Comision din tranzacție — 0.',
          'Plata mărfii prin platformă — nu se acceptă.',
          'Cererea cumpărătorului și răspunsurile la ea — gratuit.',
          'Anunț activ al furnizorului — 1 MDL pe zi, din balanța preplătită, după activarea modelului cu plată.',
          'Instrumentele de promovare cu plată — opționale, tarifele sunt publicate pe pagina de tarife.',
        ],
      },
      {
        heading: '8. Ce este interzis',
        paragraphs: [
          'Este interzisă folosirea platformei pentru acțiuni care încalcă legislația Republicii Moldova, induc în eroare alți utilizatori sau împiedică funcționarea serviciului.',
        ],
        list: [
          'Mărfuri al căror circuit este interzis sau limitat de lege, dacă nu aveți dreptul corespunzător.',
          'Produse pentru care legea cere documente ANSA sau alte autorizații, în lipsa acestora.',
          'Preț vădit neveridic, inclusiv „prețul pe gram” în loc de prețul pe kilogram, pentru a urca în sortare.',
          'Documente falsificate, date de identificare străine, persoană juridică străină.',
          'Spam, expedierea în masă a acelorași mesaje, reclama unor servicii terțe în chat și în anunțuri.',
          'Insulte, amenințări, discriminare, divulgarea datelor personale ale altora.',
          'Fotografii, texte și mărci comerciale străine fără acordul titularului de drepturi.',
          'Încercări de a ocoli caracterul sigilat al ofertelor, colectarea automată a datelor, testarea de sarcină și intervenția în funcționarea serviciului.',
        ],
      },
      {
        heading: '9. Moderare, suspendare și blocare',
        paragraphs: [
          'Putem ascunde un anunț, o cerere, o recenzie sau un mesaj, putem suspenda o companie sau bloca un cont dacă sunt încălcate legea sau acești termeni. Decizia este însoțită de motiv și, unde este posibil, de propunerea de a corecta încălcarea.',
          'Încercăm mai întâi să cerem corectarea și abia apoi ștergem. Excepție fac cazurile în care întârzierea dăunează altora: documente falsificate, tentativă de fraudă, marfă al cărei circuit este interzis.',
          'Dacă considerați decizia greșită, scrieți-ne: ea este reexaminată de un om, nu de un automat.',
        ],
      },
      {
        heading: '10. Drepturile asupra conținutului',
        paragraphs: [
          'Textele, fotografiile și documentele pe care le încărcați rămân ale dumneavoastră. Publicându-le, acordați platformei dreptul de a le afișa pe site, în rezultatele căutării, în previzualizările pentru motoarele de căutare și în notificările legate de anunțurile dumneavoastră.',
          'Designul platformei, textele ei, structura catalogului, logotipul și codul programului aparțin proprietarului Product.md. Copierea integrală a catalogului, reproducerea designului sau folosirea denumirii platformei pentru servicii proprii nu sunt permise.',
        ],
      },
      {
        heading: '11. Limitarea răspunderii',
        paragraphs: [
          'Platforma este oferită „ca atare”. Depunem eforturi rezonabile pentru ca serviciul să funcționeze stabil, dar nu garantăm disponibilitatea neîntreruptă, lipsa erorilor și nici faptul că veți găsi partenerul potrivit sau veți primi oferte la cerere.',
          'Nu răspundem pentru acțiunile utilizatorilor, pentru calitatea și legalitatea mărfii, pentru executarea înțelegerilor, pentru beneficiul nerealizat și pentru prejudiciile indirecte apărute din relația dintre cumpărător și furnizor.',
          'Nimic din acest capitol nu limitează răspunderea în măsura în care limitarea ei nu este permisă de legislația Republicii Moldova.',
        ],
      },
      {
        heading: '12. Modificarea termenilor și încetarea',
        paragraphs: [
          'Putem modifica acești termeni — de exemplu la lansarea modelului cu plată sau a unor funcții noi. Modificările esențiale sunt publicate pe această pagină cu o nouă dată de actualizare și anunțate din timp în interfață.',
          'Puteți înceta oricând să folosiți platforma și puteți șterge contul din setări. O parte din date se păstrează după ștergere în volumul descris în politica de confidențialitate: tranzacțiile finalizate rămân în formă anonimizată, pentru că cealaltă parte are un interes legitim și obligații fiscale.',
        ],
      },
      {
        heading: '13. Legea aplicabilă și litigiile',
        paragraphs: [
          'Acestor termeni li se aplică legislația Republicii Moldova. Litigiile dintre utilizator și platformă părțile încearcă să le rezolve prin corespondență; dacă nu reușesc, litigiul se examinează de instanța de la sediul proprietarului platformei.',
          `Proprietarul platformei, denumirea sa juridică, IDNO și adresa juridică sunt indicate pe pagina de contacte. La momentul publicării aceste date lipsesc — ele sunt marcate ca ${PLACEHOLDER} și se completează de proprietar înainte de lansare.`,
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- privacy
  privacy: {
    title: 'Politica de confidențialitate',
    description:
      'Ce date colectează Product.md, de ce, cât timp le păstrează și cum le puteți gestiona: export, corectare și ștergerea contului.',
    updated: '2026-08-05',
    intro:
      'Colectăm exact acele date fără de care platforma nu funcționează și explicăm aici, pe înțelesul tuturor, care anume, de ce, cât timp se păstrează și ce puteți face cu ele. Republica Moldova nu face parte din UE, dar Legea nr. 133/2011 privind protecția datelor cu caracter personal este construită pe aceleași principii ca GDPR, iar noi ne orientăm după cel mai strict dintre cele două standarde.',
    sections: [
      {
        heading: '1. Cine prelucrează datele',
        paragraphs: [
          `Operator al datelor cu caracter personal este proprietarul platformei Product.md. Denumirea juridică, IDNO, adresa juridică și adresa de contact pentru solicitări privind datele sunt indicate pe pagina de contacte și, la momentul publicării, sunt marcate ca ${PLACEHOLDER}.`,
          'Solicitările privind datele cu caracter personal se primesc la adresa de contact indicată pe pagina de contacte. Răspundem la ele într-un termen rezonabil, dar nu mai târziu de 30 de zile.',
        ],
      },
      {
        heading: '2. Ce date colectăm',
        paragraphs: [
          'Datele ajung la noi pe trei căi: le introduceți dumneavoastră, apar în timpul utilizării serviciului sau sunt transmise de browserul dumneavoastră.',
        ],
        list: [
          'Cont: nume, e-mail, telefon, limba interfeței, hash-ul parolei (parola în sine nu o păstrăm).',
          'Profilul companiei: denumirea juridică și cea afișată, IDNO, forma de organizare, adresa, raionul și localitatea, persoana de contact, telefonul, site-ul, condițiile de plată și de livrare.',
          'Publicații: anunțuri, cereri de achiziție, caracteristici, fotografii ale mărfurilor.',
          'Oferte comerciale: prețuri, condiții și atașamente — accesibile doar dumneavoastră și cumpărătorului căruia îi este adresată oferta.',
          'Corespondență: mesajele din chat și atașamentele lor.',
          'Documente pentru verificare: tipul, numărul, datele de eliberare și de expirare, fișierul în depozitul privat.',
          'Tranzacții și recenzii: componența tranzacției, sumele, statusurile, notele și comentariile.',
          'Date tehnice: adresa IP și User-Agent-ul sesiunii, încercările de autentificare, jurnalul acțiunilor din cont, interogările de căutare.',
        ],
      },
      {
        heading: '3. De ce și în ce temei',
        paragraphs: [
          'Fiecare tip de date este prelucrat pentru un scop concret, nu „la orice eventualitate”.',
        ],
        list: [
          'Numele, e-mailul și telefonul — executarea contractului: fără ele contul nu funcționează și notificările nu ajung.',
          'Datele companiei și IDNO — confirmarea legitimității partenerului, baza încrederii în relațiile B2B.',
          'Documentele — consimțământul dumneavoastră în cadrul verificării voluntare.',
          'IP, User-Agent și încercările de autentificare — interes legitim: protecția conturilor împotriva atacurilor prin forță brută și investigarea incidentelor.',
          'Jurnalul de audit — obligație legală și interes legitim: posibilitatea de a reconstitui cine și ce a modificat.',
          'Interogările de căutare — îmbunătățirea sugestiilor și a categoriilor; după 12 luni sunt anonimizate.',
        ],
      },
      {
        heading: '4. Cât timp păstrăm datele',
        paragraphs: [
          'Nu păstrăm datele mai mult decât este necesar pentru scopul în care au fost colectate.',
        ],
        list: [
          'Contul și profilul companiei — până la ștergerea contului.',
          'Documentele — până la ștergere sau până la expirarea termenului de valabilitate al documentului.',
          'Contextul sesiunii (IP, User-Agent) — durata sesiunii plus 30 de zile.',
          'Încercările de autentificare — 90 de zile.',
          'Jurnalul de audit — 2 ani.',
          'Interogările de căutare — 12 luni, apoi anonimizare.',
          'Tranzacțiile finalizate — se păstrează după ștergerea contului în formă anonimizată: cealaltă parte are interes legitim și obligații fiscale.',
        ],
      },
      {
        heading: '5. Cine are acces la date',
        paragraphs: [
          'Nu vindem date cu caracter personal și nu le transmitem rețelelor de publicitate.',
          'Profilul companiei, anunțurile și cererile publice sunt vizibile vizitatorilor platformei — așa este gândit, este vitrina dumneavoastră. Ofertele comerciale sunt vizibile doar dumneavoastră și destinatarului. Documentele de verificare nu sunt vizibile nimănui în afară de dumneavoastră și de moderatorul care examinează cererea de verificare.',
          'Datele sunt prelucrate pe serverele contractorilor noștri tehnici — găzduire, depozit de obiecte, expedierea e-mailurilor și a SMS-urilor. Ei acționează la indicația noastră și nu au dreptul să folosească datele în scopuri proprii.',
          'Transmitem date autorităților publice doar în baza unei cereri legale și formalizate și în volumul minim necesar.',
        ],
      },
      {
        heading: '6. Cookie',
        paragraphs: [
          'Folosim un minim de cookie-uri și nu instalăm dispozitive de urmărire publicitară.',
        ],
        list: [
          'Cookie de sesiune — vă menține autentificat. Fără el autentificarea este imposibilă.',
          'Cookie de limbă — reține dacă citiți site-ul în română sau în rusă.',
          'Stocarea locală a browserului — ultimele interogări de căutare; ele nu părăsesc dispozitivul dumneavoastră și se șterg cu butonul din căutare.',
        ],
      },
      {
        heading: '7. Drepturile dumneavoastră',
        paragraphs: [
          'Vă gestionați datele din cabinetul personal, nu prin corespondență cu suportul — așa este mai rapid și mai sigur.',
        ],
        list: [
          'Acces și portabilitate: exportul de date descarcă profilul, compania, anunțurile, cererile, tranzacțiile, mesajele și istoricul operațiunilor de balanță într-un singur fișier JSON.',
          'Corectare: profilul și datele companiei se editează oricând din setări.',
          'Ștergere: ștergerea contului este disponibilă în setări și se execută fără corespondență cu suportul.',
          'Opoziție: setările de notificări permit dezactivarea unor canale și tipuri de mesaje.',
          'Restricționare: compania poate fi suspendată — anunțurile nu mai sunt afișate, datele se păstrează.',
          'Plângere: aveți dreptul să vă adresați autorității naționale pentru protecția datelor cu caracter personal din Republica Moldova.',
        ],
      },
      {
        heading: '8. Ce se întâmplă la ștergerea contului',
        paragraphs: [
          'Ștergerea nu înseamnă „ascunderea butonului”, ci o succesiune de acțiuni concrete.',
        ],
        list: [
          'Contul este marcat ca șters, toate sesiunile sunt revocate imediat.',
          'E-mailul este înlocuit cu o adresă tehnică imposibil de citit, telefonul este șters, numele devine „Utilizator șters”.',
          'Fișierele documentelor companiei sunt șterse fizic din depozit.',
          'Anunțurile companiei trec în arhivă și nu mai sunt afișate.',
          'Tranzacțiile finalizate se păstrează și îi apar celeilalte părți ca „Companie ștearsă”.',
          'Recenziile se păstrează anonimizate: reputația partenerului nu trebuie să dispară odată cu contul.',
          'Ștergerea propriu-zisă este consemnată în jurnalul de audit.',
        ],
      },
      {
        heading: '9. Documentele: private în mod implicit',
        paragraphs: [
          'Documentele pe care le încărcați pentru verificare se află într-un depozit privat, fără acces public. O legătură directă către un astfel de fișier nu există.',
          'Accesul se acordă doar printr-o legătură semnată de scurtă durată — ea este valabilă câteva minute, se eliberează după verificarea drepturilor și nu se păstrează în baza de date și în jurnale.',
          'Public se vede doar rezultatul verificării. Dacă doriți să arătați documentul în sine pe profilul companiei, aceasta este o acțiune separată și conștientă din partea dumneavoastră.',
        ],
      },
      {
        heading: '10. Cum protejăm datele',
        paragraphs: [
          'Parolele se păstrează sub formă de hash-uri scrypt cu sare unică, sesiunile — sub formă de hash-uri ale token-ului, iar secretele autentificării cu doi factori sunt criptate. O copie a bazei de date nu oferă nicio parolă utilizabilă și nicio sesiune funcțională.',
          'Detaliile se află pe pagina „Securitate”. Acolo este descris și modul de raportare a unei vulnerabilități.',
        ],
      },
      {
        heading: '11. Modificarea politicii',
        paragraphs: [
          'Dacă politica se modifică, actualizăm data din partea de sus a paginii și anunțăm modificările esențiale în interfață. Continuarea utilizării platformei după modificare înseamnă acceptarea noii redacții.',
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ rules
  rules: {
    title: 'Reguli de publicare',
    description:
      'Cerințe pentru anunțuri, cereri, fotografii, prețuri și documente pe Product.md, lista celor interzise și modul de moderare.',
    updated: '2026-08-05',
    intro:
      'Aceste reguli există pentru un singur scop: ca omul care deschide un anunț să înțeleagă în zece secunde ce se vinde, la ce preț și în ce condiții. Tot ce împiedică această înțelegere este un anunț slab, chiar dacă formal nu încalcă nimic.',
    sections: [
      {
        heading: '1. Un anunț — o marfă',
        paragraphs: [
          'Anunțul descrie o singură poziție de marfă, cu un preț clar și o unitate de măsură clară. Nu publicați „toată lista de prețuri” într-un singur anunț: cumpărătorul caută o poziție concretă și filtrează după categorie și preț.',
          'Nu dublați același conținut în mai multe categorii ca să ocupați mai mult spațiu în rezultate. Dublurile se ascund, iar la repetare publicarea companiei este limitată.',
        ],
      },
      {
        heading: '2. Denumirea și descrierea',
        paragraphs: [
          'Denumirea este ceea ce se caută: numele mărfii, tipul, soiul, starea. „Carne de vită refrigerată, spată” este mai bun decât „CARNE ANGRO IEFTIN!!!”.',
        ],
        list: [
          'Fără MAJUSCULE, semne de exclamare în exces și simboluri decorative.',
          'Fără telefoane, adrese de e-mail, legături către mesagerii și site-uri terțe în denumire — contactele se preiau din profilul companiei.',
          'Fără mărci comerciale străine, dacă nu vindeți exact marfa respectivă.',
          'În descriere — ceea ce contează pentru achizitor: proveniența, ambalarea, termenul de valabilitate, condițiile de păstrare, disponibilitatea în depozit, lotul minim.',
        ],
      },
      {
        heading: '3. Fotografii',
        paragraphs: [
          'Fotografiile trebuie să arate exact marfa dumneavoastră. O fotografie bună este făcută la lumină de zi, fără colaje, rame, inscripții suprapuse și fără filigranele altor site-uri.',
          'Nu este permisă preluarea fotografiilor de pe internet, din cataloagele producătorilor sau de la alți furnizori de pe platformă. Este o încălcare a dreptului de autor și, mai important pentru cumpărător, o inducere în eroare: el va vedea altceva decât va primi.',
          'Formate — JPEG, PNG, WebP, până la 5 MB, maximum 10 fotografii pe anunț. Prima fotografie devine coperta cardului.',
        ],
      },
      {
        heading: '4. Prețul și unitatea de măsură',
        paragraphs: [
          'Prețul se indică în lei (MDL) pentru unitatea reală de vânzare: kilogram, litru, bucată, ladă, palet. Unitatea trebuie să corespundă modului în care vindeți efectiv.',
          'Coborârea artificială a prețului pentru un loc mai bun în sortare este o încălcare directă. „1 MDL” cu explicația „pentru 100 g, minimum 500 kg” în descriere induce cumpărătorul în eroare și este ascunsă de moderare.',
          'Dacă prețul este negociabil sau depinde de volum, spuneți acest lucru și descrieți grila de volume. Un onest „de la 92 MDL/kg la comenzi de peste 100 kg” funcționează mai bine decât „sunați”.',
        ],
      },
      {
        heading: '5. Categoria și caracteristicile',
        paragraphs: [
          'Alegeți cea mai exactă categorie: cumpărătorul filtrează, nu răsfoiește totul la rând. O marfă pusă în categoria greșită se arată altor oameni și nu aduce cereri.',
          'Completați caracteristicile categoriei — greutatea ambalajului, regimul de temperatură, termenul de valabilitate, proveniența. Ele participă la filtre, iar un anunț fără ele pierde o parte din trafic.',
        ],
      },
      {
        heading: '6. Documente și cerințele ANSA',
        paragraphs: [
          'Dacă pentru marfă legea cere autorizație sanitar-veterinară, înregistrarea întreprinderii la ANSA, certificat sau declarație de conformitate, trebuie să le dețineți la momentul publicării.',
          'Indicați în anunț ce documente oferiți cumpărătorului odată cu livrarea. Pentru HoReCa acesta este adesea criteriul decisiv de alegere.',
          'Publicarea unei mărfi care necesită documente permisive, în lipsa acestora, este motiv pentru ascunderea imediată a anunțului și verificarea companiei.',
          `Trimiterile concrete la actele normative în vigoare și la listele ANSA vor fi adăugate de proprietarul platformei după verificarea juridică — deocamdată ele sunt marcate ca ${PLACEHOLDER}.`,
        ],
      },
      {
        heading: '7. Cereri de achiziție',
        paragraphs: [
          'Cererea este solicitarea cumpărătorului: ce îi trebuie, cât, unde să fie livrat, până când, ce documente sunt necesare și cum se plănuiește plata. Cu cât cererea este mai concretă, cu atât ofertele sunt mai consistente.',
          'Cererile sunt gratuite și rămân gratuite. Nu folosiți cererea ca reclamă pentru propriile servicii și nu publicați cereri „de test”, fără intenția de a cumpăra — asta consumă timpul furnizorilor și scade încrederea în platformă.',
          'Dacă achiziția a fost anulată, închideți cererea. Furnizorii văd statusul și nu vor pregăti o cotație degeaba.',
        ],
      },
      {
        heading: '8. Oferte comerciale',
        paragraphs: [
          'Când răspundeți la o cerere, indicați prețul real și condițiile pe care sunteți gata să le respectați. Oferta este sigilată: o vede doar cumpărătorul, deci nu are rost să coborâți prețul „de ochii lumii”.',
          'O ofertă la o cerere. Dacă trebuie schimbate condițiile, editați-vă oferta, nu depuneți una nouă dintr-un alt profil.',
          'Încercarea de a afla condițiile altora — prin cumpărător, prin corespondență sau altfel — încalcă regula de bază a platformei și duce la blocare.',
        ],
      },
      {
        heading: '9. Ce este interzis să publicați',
        paragraphs: [
          'Lista este scurtă și nu are excepții.',
        ],
        list: [
          'Mărfuri al căror circuit în Republica Moldova este interzis sau necesită o licență pe care nu o dețineți.',
          'Produse alimentare fără documentele cerute de lege.',
          'Documente falsificate, date de identificare străine, certificate străine.',
          'Prețuri, caracteristici și disponibilitate vădit false.',
          'Spam, anunțuri repetate, reclama altor platforme și servicii.',
          'Insulte, amenințări, discriminare de orice fel.',
          'Fotografii, texte, logotipuri și mărci comerciale străine fără permisiune.',
          'Date cu caracter personal ale terților fără acordul lor.',
        ],
      },
      {
        heading: '10. Comunicarea și recenziile',
        paragraphs: [
          'În chat vorbiți la obiect și păstrați un ton de afaceri. Cererea de a transfera un avans pe cardul unei persoane fizice este un semn tipic de fraudă; anunțați-ne imediat.',
          'O recenzie poate fi lăsată doar după o tranzacție finalizată, câte una în fiecare direcție. Recenzia trebuie să descrie o experiență reală: ce ați comandat, ce ați primit, cum a decurs livrarea. Furnizorul poate răspunde la recenzie o singură dată.',
          'Recenziile nu se șterg la cererea companiei din cauza unei note mici. Se ascunde doar ceea ce încalcă regulile: insulte, date personale, reclamă, recenzie fără tranzacție.',
        ],
      },
      {
        heading: '11. Cum funcționează moderarea',
        paragraphs: [
          'Moderarea lucrează pe bază de reclamații și prin verificări selective. Moderatorul poate aproba un anunț, poate cere corectarea lui, îl poate ascunde sau poate bloca compania — cu un comentariu obligatoriu care explică motivul.',
          'La nevoie, administratorul activează premoderarea: atunci anunțurile noi se publică după verificare. Este o măsură temporară pentru cazul unui val de încălcări.',
          'Puteți reclama un anunț, o cerere, o ofertă, o companie, un mesaj sau o recenzie — butonul de reclamație există la fiecare dintre aceste obiecte. Reclamația ajunge în coada de moderare și pe baza ei se ia o decizie.',
        ],
      },
    ],
  },

  // --------------------------------------------------------------- security
  security: {
    title: 'Securitate',
    description:
      'Cum protejează Product.md parolele, sesiunile și documentele, ce face cu ofertele sigilate și cum puteți raporta o vulnerabilitate.',
    updated: '2026-08-05',
    intro:
      'Aici este descris exact ce facem pentru protecția conturilor și a datelor — fără marketing și fără promisiuni pe care nu le putem susține. Dacă ați găsit o vulnerabilitate, ultimul capitol explică cum să ne anunțați.',
    sections: [
      {
        heading: '1. Parolele',
        paragraphs: [
          'Nu păstrăm parolele. În baza de date se află un hash scrypt — rezultatul unui calcul intenționat lent, cu o sare aleatorie unică pentru fiecare parolă. Ghicirea unui astfel de hash este costisitoare chiar și cu echipamente specializate, pentru că scrypt cere nu doar timp de procesor, ci și memorie.',
          'Parametrii calculului sunt scriși alături de hash, așa că îi putem întări în viitor fără a obliga pe toată lumea să schimbe parola. Comparația se face în timp constant, ca viteza răspunsului să nu trădeze prefixul corect.',
          'Cerințe minime pentru parolă: cel puțin 8 caractere, cel puțin o literă și cel puțin o cifră. Verificarea se face și în browser, și pe server — browserului nu îi acordăm încredere.',
        ],
      },
      {
        heading: '2. Sesiuni și deconectarea de pe toate dispozitivele',
        paragraphs: [
          'După autentificare, browserul primește un token aleatoriu opac într-un cookie. În baza de date se păstrează nu el, ci hash-ul lui: nici măcar o copie completă a bazei nu oferă o sesiune funcțională.',
          'Fiecare sesiune reține de la ce IP și din ce browser a fost creată — acest lucru se vede în setările de securitate, ca să puteți observa o autentificare străină.',
          'Sesiunea poate fi revocată: „ieșire” încheie sesiunea curentă, „ieșire de pe toate dispozitivele” — pe toate celelalte. Valabilitatea sesiunii este verificată la fiecare cerere, de aceea revocarea și blocarea contului au efect imediat, nu „când expiră token-ul”.',
        ],
      },
      {
        heading: '3. Protecția împotriva ghicirii parolelor',
        paragraphs: [
          'Încercările de autentificare sunt limitate simultan pe două axe: după identificator (e-mail sau telefon) și după adresa IP. Doar după identificator — și un atacator ar putea bloca conturile altora; doar după IP — și o rețea de boți ar ocoli limita. Împreună acoperă ambele scenarii.',
          'Fiecare încercare de autentificare, reușită sau nu, se înregistrează cu identificatorul, IP-ul și rezultatul — este material de investigație, independent de limitator.',
          'Mesajul de eroare la autentificare este intenționat identic — „Email sau parolă incorectă”. Texte diferite pentru „nu există acest utilizator” și „parolă greșită” ar transforma formularul într-un instrument de verificare a existenței conturilor.',
        ],
      },
      {
        heading: '4. Autentificarea cu doi factori pentru administratori',
        paragraphs: [
          'Administratorul nu poate intra în panoul de administrare fără autentificare cu doi factori activată: nu este o recomandare, ci o condiție de acces.',
          'Se folosește TOTP standard — un cod de șase cifre care se schimbă la fiecare 30 de secunde, compatibil cu Google Authenticator, 1Password, Aegis și Authy. Este admisă o diferență de ceas de cel mult un pas.',
          'Secretul TOTP se păstrează criptat în baza de date. Fără cheia aplicației, o copie a bazei nu permite generarea codurilor.',
        ],
      },
      {
        heading: '5. Documentele și depozitul privat',
        paragraphs: [
          'Documentele de verificare, atașamentele ofertelor sigilate și atașamentele cererilor private se află într-un depozit privat separat, fără citire publică. O legătură directă către un astfel de fișier nu funcționează niciodată.',
          'Singurul mod de a deschide fișierul este o legătură semnată de scurtă durată, valabilă câteva minute, eliberată doar după verificarea drepturilor. O astfel de legătură nu se salvează în baza de date și nu ajunge în jurnale.',
          'Public se vede doar rezultatul verificării. Documentul în sine apare pe profilul companiei doar dacă proprietarul a activat explicit acest lucru.',
        ],
      },
      {
        heading: '6. Caracterul sigilat al ofertelor comerciale',
        paragraphs: [
          'Caracterul sigilat al cotațiilor nu este o setare, ci un invariant al sistemului. Furnizorul citește doar propria ofertă; cumpărătorul care deține cererea citește toate ofertele la ea; o persoană străină nu citește nimic.',
          'Nu există o rută publică de citire a ofertelor: orice acces trece prin verificarea proprietății pe server. Regula este fixată printr-un test automat care nu permite slăbirea ei accidentală la refactorizare.',
          'Accesul unui moderator sau administrator este posibil doar din necesitate de serviciu, la examinarea unui litigiu, și se consemnează în jurnalul de audit.',
        ],
      },
      {
        heading: '7. Fișierele încărcate',
        paragraphs: [
          'Fișierul este verificat nu după ce a declarat browserul, ci după conținutul real: serverul citește primii octeți și compară semnătura formatului cu extensia și cu tipul așteptat.',
          'Sunt permise JPEG, PNG și WebP pentru fotografii și, în plus, PDF pentru documente. SVG este exclus în mod deliberat din lista albă — este XML executabil, capabil să transporte un script.',
          'Numele de fișier dat de utilizator nu participă niciodată la calea de stocare: cheia obiectului este generată de server. Numele original se păstrează doar pentru afișare și este escapat la afișare.',
        ],
      },
      {
        heading: '8. Moderare și reclamații',
        paragraphs: [
          'Puteți reclama un anunț, o cerere, o ofertă, o companie, un mesaj și o recenzie. Reclamația ajunge în coada de moderare, unde sarcina are prioritate și responsabil, iar decizia este însoțită de comentariu.',
          'Acțiunile administratorilor și moderatorilor asupra obiectelor altora se consemnează în jurnalul de audit cu o imagine „înainte și după”, cu motivul și cu adresa IP. Astfel sunt protejați și utilizatorii de abuz, și platforma de abuzuri interne.',
        ],
      },
      {
        heading: '9. Ce depinde de dumneavoastră',
        paragraphs: [
          'O parte din securitate se află de partea dumneavoastră și nicio protecție de server nu o poate înlocui.',
        ],
        list: [
          'Folosiți o parolă unică, pe care nu o utilizați nicăieri altundeva.',
          'Nu dați acces la cont angajaților „pentru o vreme” — creați conturi separate.',
          'Verificați sesiunile active și încheiați-le pe cele necunoscute.',
          'Nu transferați avansuri pe cardul unei persoane fizice și nu trimiteți documente în afara platformei unui partener necunoscut.',
          'Verificați IDNO și denumirea juridică a companiei în registrul oficial înainte de o tranzacție mare.',
          'Rețineți: angajații platformei nu vă cer niciodată parola și codul de confirmare.',
        ],
      },
      {
        heading: '10. Cum raportați o vulnerabilitate',
        paragraphs: [
          `Dacă ați găsit o vulnerabilitate, scrieți-ne la adresa de securitate indicată pe pagina de contacte (deocamdată marcată ca ${PLACEHOLDER}), cu subiectul care începe cu cuvântul SECURITY.`,
          'În mesaj este util să indicați: tipul vulnerabilității și componenta afectată (adresa paginii, cererea, fișierul), reproducerea pas cu pas, evaluarea consecințelor și, dacă există, un proof of concept. Indicați numele sau pseudonimul, dacă doriți să fiți menționat la mulțumiri.',
          'Confirmăm primirea în 48 de ore, oferim o evaluare inițială în 5 zile lucrătoare și vă anunțăm despre lansarea corecției imediat după publicarea ei.',
        ],
        list: [
          'Nu vom întreprinde acțiuni juridice împotriva cercetătorului care nu depășește limitele necesare demonstrării problemei.',
          'Nu accesați datele altora: în caz de acces accidental, opriți-vă imediat și anunțați-ne.',
          'Nu perturbați funcționarea serviciului — fără refuz de serviciu, spam și atacuri prin forță brută în mediul de producție.',
          'Nu divulgați public vulnerabilitatea până la lansarea corecției sau până la expirarea a 90 de zile de la raportare.',
          'Rapoartele scanerelor automate, fără demonstrarea exploatării, nu sunt examinate.',
        ],
      },
    ],
  },

  // ------------------------------------------------------------------- help
  help: {
    title: 'Ajutor',
    description:
      'Răspunsuri la întrebări frecvente despre Product.md: cum găsiți un furnizor, cum publicați o cerere, cum funcționează ofertele sigilate, cât costă publicarea.',
    updated: '2026-08-05',
    intro:
      'Răspunsuri scurte la ceea ce se întreabă cel mai des. Dacă întrebarea dumneavoastră nu este aici, scrieți-ne — contactele sunt adunate pe o pagină separată.',
    groups: [
      {
        title: 'Primii pași',
        items: [
          {
            question: 'Ce este Product.md și prin ce se deosebește de un site de anunțuri?',
            answer: [
              'Product.md este o platformă de comerț angro cu produse pentru afaceri: restaurante, cafenele, magazine, cantine, producători. Pe lângă catalogul obișnuit de mărfuri, aici există cereri de achiziție: descrieți ce vă trebuie, iar furnizorii vă trimit singuri prețurile și condițiile lor.',
              'Răspunsurile furnizorilor sunt sigilate — concurentul nu vede prețul altuia. Exact așa funcționează o achiziție B2B reală și exact asta lipsește de pe un site obișnuit de anunțuri.',
            ],
          },
          {
            question: 'Trebuie să fiu persoană juridică?',
            answer: [
              'Platforma este gândită pentru mediul de afaceri: companii, întreprinzători individuali și gospodării țărănești. Pentru publicarea anunțurilor și răspunsul la cereri este nevoie de un profil de companie completat, cu denumirea juridică și IDNO.',
              'Catalogul și cererile pot fi consultate și fără înregistrare.',
            ],
          },
          {
            question: 'Cum mă înregistrez?',
            answer: [
              'Apăsați „Înregistrare”, indicați numele, e-mailul și parola, confirmați adresa din e-mailul primit. Apoi completați profilul companiei — el determină ce vor afla partenerii despre dumneavoastră.',
              'Parola trebuie să aibă cel puțin 8 caractere și să conțină cel puțin o literă și o cifră.',
            ],
          },
          {
            question: 'Site-ul este în două limbi — contează limba aleasă pentru ce văd?',
            answer: [
              'Nu. Versiunile română și rusă arată aceleași mărfuri, cereri și companii — diferă doar limba interfeței și adresa paginii. Comutatorul de limbă păstrează pagina pe care vă aflați.',
            ],
          },
        ],
      },
      {
        title: 'Pentru cumpărători',
        items: [
          {
            question: 'Cum găsesc marfa de care am nevoie?',
            answer: [
              'Începeți cu căutarea din antet: ea sugerează categorii, mărfuri, furnizori și cereri încă de la două caractere introduse. Apoi, în catalog, restrângeți selecția cu filtrele — categorie, raion, preț, comandă minimă, existența livrării.',
            ],
          },
          {
            question: 'Ce este o cerere de achiziție și de ce este utilă?',
            answer: [
              'Cererea răstoarnă căutarea: în loc să sunați furnizorii unul câte unul, descrieți o singură dată necesarul — ce, cât, unde, până când, ce documente sunt necesare — și primiți oferte de la cei care sunt gata să îl acopere.',
              'Publicarea cererii și primirea ofertelor sunt întotdeauna gratuite.',
            ],
          },
          {
            question: 'Văd furnizorii ofertele celorlalți?',
            answer: [
              'Nu. Fiecare furnizor vede doar propria ofertă. Dumneavoastră, ca autor al cererii, le vedeți pe toate și le comparați într-un singur tabel.',
              'Public, la cerere se afișează doar numărul de oferte primite — fără prețuri și fără lista participanților.',
            ],
          },
          {
            question: 'Cum verific un furnizor înainte de achiziție?',
            answer: [
              'Priviți insignele de verificare de pe profilul companiei: telefon, e-mail, înregistrare, IDNO, documente și autorizații ANSA confirmate. Apoi — reitingul, recenziile la tranzacțiile finalizate și numărul de tranzacții.',
              'Înainte de o achiziție mare, verificați denumirea juridică și IDNO în registrul oficial și cereți documentele mărfii. Platforma nu poate garanta buna-credință a partenerului.',
            ],
          },
        ],
      },
      {
        title: 'Pentru furnizori',
        items: [
          {
            question: 'Cum public o marfă?',
            answer: [
              'Completați profilul companiei, apoi apăsați „Publică” și alegeți „Marfă”. Indicați categoria, denumirea, prețul pentru unitatea reală de vânzare, comanda minimă și condițiile de livrare, adăugați fotografii ale mărfii dumneavoastră.',
              'Cerințele de conținut sunt adunate în „Reguli de publicare” — merită citite o dată înainte de prima publicare.',
            ],
          },
          {
            question: 'Cum răspund la cererile cumpărătorilor?',
            answer: [
              'Deschideți secțiunea de cereri, găsiți-o pe cea potrivită și trimiteți o ofertă comercială: preț, volum, termen de livrare, condiții de plată și, la nevoie, un atașament cu lista de prețuri sau cu un certificat.',
              'O ofertă la o cerere. Condițiile pot fi schimbate prin editarea propriei oferte.',
            ],
          },
          {
            question: 'Îmi vor vedea concurenții prețul?',
            answer: [
              'Nu. Oferta este citită doar de cumpărătorul căruia îi este adresată. Nici prețul, nici condițiile, nici atașamentele nu sunt accesibile altor furnizori — iar această regulă este în construcția sistemului, nu în setări.',
            ],
          },
          {
            question: 'De ce anunțul meu este privit rar?',
            answer: [
              'Cel mai des motivele sunt simple: categorie imprecisă, denumire vagă, lipsa prețului, fotografie străină sau întunecată, caracteristici necompletate după care se filtrează.',
              'Priviți anunțul cu ochii unui achizitor: se înțelege în zece secunde ce este, la ce preț și în ce condiții?',
            ],
          },
        ],
      },
      {
        title: 'Bani și tarife',
        items: [
          {
            question: 'Cât costă utilizarea platformei?',
            answer: [
              'La lansare publicarea este gratuită pentru toți. După activarea modelului cu plată, un anunț activ al furnizorului costă 1 MDL pe zi; cererile cumpărătorilor rămân gratuite întotdeauna.',
              'Despre activarea modelului cu plată anunțăm din timp, iar furnizorul nou primește o perioadă de probă gratuită.',
            ],
          },
          {
            question: 'Percepe platforma comision din tranzacție?',
            answer: [
              'Nu. Comision din tranzacție nu există, iar plata pentru marfă nu este încasată de platformă. Cumpărătorul și furnizorul se decontează direct, în modul convenabil lor.',
            ],
          },
          {
            question: 'Cum funcționează balanța?',
            answer: [
              'Compania alimentează balanța internă printr-o singură plată, iar din ea se scade zilnic costul anunțurilor active. Astfel nu este nevoie de rețineri zilnice de pe card.',
              'Fiecare operațiune ajunge în istoric, cu suma și cu soldul înainte și după — istoricul poate fi exportat.',
            ],
          },
          {
            question: 'Ce se întâmplă dacă balanța se epuizează?',
            answer: [
              'La apropierea de zero sosește un avertisment cu estimarea zilelor rămase. La zero, anunțurile se suspendă, nu se șterg: conținutul, fotografiile și statistica se păstrează.',
              'După alimentare afișarea se reia. Cererile cumpărătorului funcționează independent de balanță.',
            ],
          },
        ],
      },
      {
        title: 'Verificare și documente',
        items: [
          {
            question: 'Ce oferă verificarea?',
            answer: [
              'Insigne pe profilul companiei și în rezultatele căutării. Pentru cumpărător este primul semn că firma este reală și că are documentele în ordine, iar pentru furnizor este un avantaj vizibil atunci când își prezintă ofertele.',
            ],
          },
          {
            question: 'Cine îmi va vedea documentele?',
            answer: [
              'Nimeni, în afară de dumneavoastră și de moderatorul care examinează cererea de verificare. Documentele se află într-un depozit privat, o legătură directă către fișier nu există, iar accesul se acordă printr-o legătură semnată de scurtă durată, după verificarea drepturilor.',
              'Public se vede doar rezultatul verificării. Documentul în sine va apărea pe profilul companiei doar dacă activați dumneavoastră publicarea lui.',
            ],
          },
          {
            question: 'Ce fac dacă documentul expiră în curând?',
            answer: [
              'Încărcați un document nou înainte de expirare: insigna trece automat în starea „expirat”, iar anunțurile pierd o parte din încrederea cumpărătorilor.',
            ],
          },
        ],
      },
      {
        title: 'Securitate și litigii',
        items: [
          {
            question: 'Cum recunoașteți un escroc?',
            answer: [
              'Semne tipice: cererea de a transfera un avans pe cardul unei persoane fizice, refuzul de a arăta documentele mărfii, presiunea prin urgență, insistența de a muta discuția în mesagerie imediat după primul mesaj, un preț vizibil sub piață fără explicație.',
              'Anunțați-ne despre un astfel de contact: vom verifica firma și, la nevoie, o vom bloca.',
            ],
          },
          {
            question: 'Cum reclam un anunț sau o companie?',
            answer: [
              'Fiecare anunț, cerere, ofertă, recenzie și profil de companie are un buton de reclamație. Descrieți ce nu este în regulă și atașați dovezi — reclamația va ajunge în coada de moderare.',
              'În urma examinării, obiectul poate fi corectat, ascuns, iar compania — suspendată sau blocată.',
            ],
          },
          {
            question: 'Furnizorul nu a respectat înțelegerea. Ce face platforma?',
            answer: [
              'Platforma nu este parte a tranzacției și nu poate recupera bani sau obliga la livrare. Vom verifica firma, îi vom retrage insignele la o încălcare confirmată, o vom suspenda sau bloca.',
              'Recenzia la o tranzacție finalizată rămâne publică și îi avertizează pe ceilalți cumpărători.',
            ],
          },
        ],
      },
      {
        title: 'Cont și date',
        items: [
          {
            question: 'Cum îmi export datele?',
            answer: [
              'În setările contului există exportul de date: profilul, compania, anunțurile, cererile, tranzacțiile, mesajele și istoricul operațiunilor de balanță se descarcă într-un singur fișier JSON.',
            ],
          },
          {
            question: 'Cum îmi șterg contul?',
            answer: [
              'Ștergerea este disponibilă în setările contului și nu necesită corespondență cu suportul. Sesiunile sunt revocate imediat, datele de contact sunt anonimizate, fișierele documentelor sunt șterse, iar anunțurile trec în arhivă.',
              'Tranzacțiile finalizate și recenziile se păstrează în formă anonimizată: cealaltă parte are interes legitim și obligații fiscale.',
            ],
          },
          {
            question: 'Mi-am uitat parola.',
            answer: [
              'Pe pagina de autentificare există legătura de recuperare: vom trimite un e-mail cu o legătură pentru schimbarea parolei. Legătura este de unică folosință și are valabilitate limitată.',
            ],
          },
        ],
      },
    ],
    outro: {
      heading: 'Nu ați găsit răspunsul?',
      paragraphs: [
        'Scrieți-ne — contactele sunt adunate pe pagina de contacte. Dacă întrebarea privește un anunț, o cerere sau o tranzacție anume, atașați legătura: așa răspunsul vine mai repede.',
        'Dacă este vorba despre o încălcare a regulilor, folosiți butonul de reclamație direct pe obiect — astfel de sesizări ajung în coada de moderare cu prioritate.',
      ],
    },
  },

  // --------------------------------------------------------------- contacts
  contacts: {
    title: 'Contacte',
    description:
      'Cum contactați echipa Product.md: adrese pentru solicitări, reclamații și probleme de securitate, legături către ajutor și reguli.',
    updated: '2026-08-05',
    intro:
      'Mai jos sunt canalele de legătură cu platforma. O parte dintre ele nu sunt încă completate: platforma este pregătită tehnic pentru lansare, dar datele proprietarului sunt indicate de el însuși. Preferăm să arătăm un gol onest decât o adresă inventată.',
    placeholderNotice: {
      heading: 'Datele de contact nu sunt încă completate',
      paragraphs: [
        `Valorile de mai jos, marcate ca ${PLACEHOLDER}, trebuie înlocuite de proprietarul platformei înainte de lansare: denumirea juridică, IDNO, adresa juridică, adresele de e-mail, telefonul și programul de lucru al suportului.`,
        'Lista completă a celor de completat se află în fișierul PLACEHOLDERS.md din depozitul proiectului. Până la completare, pe această pagină nu există formular de contact — un formular care nu funcționează este mai rău decât lipsa lui, pentru că lasă impresia unei solicitări trimise.',
      ],
    },
    channelsHeading: 'Canale de legătură',
    channels: [
      {
        label: 'Întrebări generale',
        value: PLACEHOLDER,
        note: 'Adresa de e-mail pentru întrebări despre funcționarea platformei, colaborare și propuneri.',
        isPlaceholder: true,
        hrefPrefix: 'mailto:',
      },
      {
        label: 'Suport pentru utilizatori',
        value: PLACEHOLDER,
        note: 'Adresa pentru solicitări privind contul, anunțurile, cererile și balanța. Atașați legătura către obiect — așa răspunsul vine mai repede.',
        isPlaceholder: true,
        hrefPrefix: 'mailto:',
      },
      {
        label: 'Reclamații și moderare',
        value: PLACEHOLDER,
        note: 'Adresa pentru reclamațiile care nu pot fi trimise prin butonul de pe obiect. Reclamațiile obișnuite privind un anunț, o cerere, o recenzie sau o companie ajung mai repede direct de pe pagina lor.',
        isPlaceholder: true,
        hrefPrefix: 'mailto:',
      },
      {
        label: 'Raportarea vulnerabilităților',
        value: PLACEHOLDER,
        note: 'Adresa pentru cercetătorii în securitate. Subiectul mesajului trebuie să înceapă cu cuvântul SECURITY. Condițiile divulgării responsabile sunt descrise pe pagina „Securitate”.',
        isPlaceholder: true,
        hrefPrefix: 'mailto:',
      },
      {
        label: 'Telefon',
        value: PLACEHOLDER,
        note: 'Numărul de telefon al suportului, în formatul +373 XX XXX XXX.',
        isPlaceholder: true,
        hrefPrefix: 'tel:',
      },
      {
        label: 'Program de lucru',
        value: PLACEHOLDER,
        note: 'Programul suportului, cu indicarea fusului orar (Chișinău, EET/EEST).',
        isPlaceholder: true,
      },
      {
        label: 'Persoană juridică',
        value: PLACEHOLDER,
        note: 'Denumirea completă a companiei — proprietar al platformei — și IDNO-ul ei (13 cifre).',
        isPlaceholder: true,
      },
      {
        label: 'Adresa juridică',
        value: PLACEHOLDER,
        note: 'Adresa de înregistrare a companiei în Republica Moldova.',
        isPlaceholder: true,
      },
    ],
    sections: [
      {
        heading: 'Cum obțineți un răspuns mai rapid',
        paragraphs: [
          'Descrieți situația concret și atașați legătura către anunțul, cererea, tranzacția sau mesajul despre care este vorba. O captură de ecran cu adresa paginii vizibilă înlocuiește adesea trei e-mailuri de precizări.',
        ],
        list: [
          'Indicați e-mailul sau telefonul asociat contului — după el vă găsim compania.',
          'Descrieți ce ați făcut și ce vă așteptați să vedeți.',
          'Atașați textul exact al mesajului de eroare, dacă a existat.',
          'Nu trimiteți parole și coduri de confirmare — nu ne sunt necesare niciodată.',
        ],
      },
      {
        heading: 'Reclamație privind un anunț sau o companie',
        paragraphs: [
          'Butonul de reclamație există la fiecare anunț, cerere, ofertă, recenzie și profil de companie. Reclamația trimisă prin buton ajunge direct în coada de moderare, cu indicarea obiectului — este mai rapid și mai exact decât un e-mail.',
          'Prin e-mail merită să scrieți doar dacă reclamația prin buton este imposibilă: obiectul a fost deja șters, este vorba despre un comportament din afara platformei sau trebuie atașate documente.',
        ],
      },
      {
        heading: 'Întrebări privind datele cu caracter personal',
        paragraphs: [
          'Exportul datelor, corectarea profilului și ștergerea contului sunt disponibile în setări, fără a contacta suportul — așa este mai rapid și nu necesită confirmarea identității prin corespondență.',
          'Dacă acțiunea de care aveți nevoie nu există în interfață, scrieți la adresa generală: răspundem la astfel de solicitări în cel mult 30 de zile. Ce anume păstrăm și cât timp este descris în politica de confidențialitate.',
        ],
      },
    ],
    linksHeading: 'Pagini utile',
    links: [
      {
        label: 'Ajutor',
        description: 'Răspunsuri la întrebări frecvente despre cereri, oferte, tarife și verificare.',
        target: 'help',
      },
      {
        label: 'Reguli de publicare',
        description: 'Ce se poate și ce nu se poate publica și cum funcționează moderarea și reclamațiile.',
        target: 'rules',
      },
      {
        label: 'Securitate',
        description: 'Cum sunt protejate conturile și documentele și cum raportați o vulnerabilitate.',
        target: 'security',
      },
      {
        label: 'Politica de confidențialitate',
        description: 'Ce date colectăm, cât timp le păstrăm și cum le gestionați.',
        target: 'privacy',
      },
    ],
  },

  // --------------------------------------------------------------- partners
  partners: {
    title: 'Pentru parteneri',
    description:
      'Colaborare cu Product.md: asociații și uniuni de producători, distribuitori, media de ramură, integrări și promovare.',
    updated: '2026-08-05',
    intro:
      'Product.md construiește piața comerțului angro cu produse din Moldova, iar o piață nu se construiește de o singură echipă. Aici este descris cu cine și cum suntem gata să lucrăm și ce îi putem oferi unui partener.',
    sections: [
      {
        heading: 'Cui i-ar putea fi util',
        paragraphs: [
          'Căutăm parteneri care au deja relații cu producătorii de alimente sau cu achizitorii din HoReCa. Platforma le oferă un instrument, nu un concurent.',
        ],
        list: [
          'Asociații de producători și uniuni de fermieri — prezența colectivă a membrilor pe platformă.',
          'Distribuitori și depozite angro — vitrină pentru sortiment și acces la fluxul de cereri.',
          'Companii de logistică — ofertă de livrare pentru furnizorii care nu o au.',
          'Media de ramură și expoziții — materiale comune și schimb de audiență.',
          'Dezvoltatori de sisteme de evidență și ERP — schimb de date despre nomenclator și stocuri.',
          'Incubatoare de afaceri și programe de sprijin pentru IMM — însoțirea fermierilor la intrarea în online.',
        ],
      },
      {
        heading: 'Ce oferă parteneriatul',
        paragraphs: [
          'Parteneriatul se construiește în jurul a ceea ce platforma știe deja să facă, nu în jurul promisiunilor.',
        ],
        list: [
          'Sprijin la conectarea membrilor asociației: transferul nomenclatorului, crearea profilurilor, instruirea în lucrul cu cererile.',
          'Fluxul de cereri ale cumpărătorilor, distribuit pe categorii și raioane — vizibilitate directă asupra cererii.',
          'Oferte comerciale sigilate: furnizorii parteneri concurează prin condiții, nu printr-o cursă a prețurilor în jos.',
          'Insigne de verificare care reflectă apartenența la asociație și existența documentelor de ramură.',
          'Selecții și buletine informative comune, adresate segmentului relevant de cumpărători.',
        ],
      },
      {
        heading: 'Formate de colaborare',
        paragraphs: [
          'Preferăm să începem cu un pilot concret, pe un set limitat de companii, și să extindem după un rezultat măsurabil, în loc să semnăm acorduri-cadru fără conținut.',
        ],
        list: [
          'Pilot cu un grup de furnizori: conectare, instruire, analiza comună a primelor tranzacții.',
          'Parteneriat informațional: materiale despre modul în care funcționează achiziția angro, pentru audiența partenerului.',
          'Evenimente comune: expoziții, zile ale furnizorului, întâlniri de instruire pentru achizitorii din HoReCa.',
          'Înțelegeri de recomandare pentru consultanți și integratori care aduc companii pe platformă.',
        ],
      },
      {
        heading: 'Promovarea pe platformă',
        paragraphs: [
          'Instrumentele de promovare cu plată — ridicarea anunțului, fixarea în categorie, plasarea pe pagina principală, evidențierea cardului, eticheta de urgență și promovarea în buletinul informativ — sunt accesibile oricărei companii și nu necesită statut de partener.',
          'Nu vindem locuri în rezultatele căutării ocolind relevanța: pozițiile promovate sunt întotdeauna marcate, iar rezultatele obișnuite rămân oneste. Altfel cumpărătorul încetează să aibă încredere în căutare, iar platforma își pierde sensul.',
          'Tarifele actuale sunt publicate pe pagina de tarife.',
        ],
      },
      {
        heading: 'Integrări și schimb de date',
        paragraphs: [
          'Încărcarea în masă a nomenclatorului și interfața de programare pentru furnizorii mari sunt în planurile de dezvoltare, nu în posibilitățile de astăzi. Spunem asta direct, ca partenerul să își facă planuri realiste.',
          'Dacă aveți un sistem de evidență cu export de stocuri și prețuri, scrieți-ne: prioritatea dezvoltării este stabilită de cererile reale, nu de ipoteze.',
        ],
      },
      {
        heading: 'Cum începem discuția',
        paragraphs: [
          `Scrieți la adresa generală a platformei, indicată pe pagina de contacte — deocamdată este marcată ca ${PLACEHOLDER} și se completează de proprietar înainte de lansare.`,
          'În mesaj este util să indicați din start: pe cine reprezentați, câte companii pot fi conectate, în ce categorii și raioane lucrează ele și ce rezultat considerați un succes al pilotului.',
        ],
      },
    ],
  },
}
