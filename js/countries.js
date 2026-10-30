// ============================================================================
//  COUNTRIES  (the "Videos / Countries" switch on the left panel)
//
//  In Countries mode the video panels disappear and a waving flag stands on
//  every capital. Click a flag (or a country in the left list) to open its
//  panel: flag, name + native name, government type and leaders with photos.
//
//  To add a country: copy one whole { ... } block below, paste it after the
//  last one (keep the comma between blocks) and change:
//    name        - English name
//    native      - name in its own language (leave '' if it is the same)
//    code        - 2-3 letters, only shown if the flag image fails to load
//    capital     - capital city name
//    coords      - "lat, lng" of the capital (the Copy button on the map)
//    government  - government type. Either plain text, or a list that changes
//                  with the date:  [ { from: '1933-03-23', text: '...' }, ... ]
//    flag        - the flag image (see "Images" below)
//    leaders     - list of { name, role, from, to, image }
//
//  The panel follows the year chosen with the Historical Borders year buttons
//  and shows what was true on that map's date (1 January, except 1939 =
//  1 September 1939 and 1945 = 5 June 1945; see borders.js).
//    from / to   - dates as 'YYYY-MM-DD' (or just 'YYYY'). A leader or government
//                  entry is shown if  from <= map date < to.  So "to" is the day
//                  they LEFT office. Leave "from" out if it is always true, and
//                  "to" out if it is still true at the end of the war.
//                  Optional years: '1933-1945' overrides the years shown.
//
//  Images: write either
//    wiki('File name.svg')     a file from Wikimedia Commons: open the file's
//                              page on commons.wikimedia.org and copy its name
//                              exactly (without the "File:" part), or
//    'img/flags/germany.png'   a file inside your site folder, or
//    'https://...'             any direct image link.
//  A missing or broken image never breaks anything: flags show the country
//  code, leaders show their initials.
// ============================================================================
const wiki = (file, width = 300) =>
  'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(file) + '?width=' + width;

const COUNTRIES = [
  {
    name: 'Germany',
    native: 'Deutsches Reich',
    code: 'DE',
    capital: 'Berlin',
    coords: '52.51568, 13.39247',
    government: [
      { to: '1945-05-23', text: 'Totalitarian one-party dictatorship (Nazi Germany)' },
      { from: '1945-05-23', text: 'Allied occupation, no German government (Berlin Declaration, 5 June 1945)' }
    ],
    flag: wiki('Flag of Germany (1935\u20131945).svg'),
    leaders: [
      { name: 'Adolf Hitler', role: 'F\u00FChrer and Chancellor', from: '1933-01-30', to: '1945-04-30', image: '' },
      { name: 'Dwight D. Eisenhower', role: 'Allied commander-in-chief (United States zone)', from: '1945-06-05', image: '' },
      { name: 'Georgy Zhukov', role: 'Allied commander-in-chief (Soviet zone)', from: '1945-06-05', image: '' },
      { name: 'Bernard Montgomery', role: 'Allied commander-in-chief (British zone)', from: '1945-06-05', image: '' },
      { name: 'Jean de Lattre de Tassigny', role: 'Allied commander-in-chief (French zone)', from: '1945-06-05', image: '' }
    ]
  },
  {
    name: 'United Kingdom',
    native: '',
    code: 'UK',
    capital: 'London',
    coords: '51.50735, -0.12776',
    government: 'Constitutional monarchy, parliamentary democracy',
    flag: wiki('Flag of the United Kingdom (3-5).svg'),
    leaders: [
      { name: 'George VI', role: 'King', from: '1936-12-11', to: '1952-02-06', image: '' },
      { name: 'Neville Chamberlain', role: 'Prime Minister', from: '1937-05-28', to: '1940-05-10', image: '' },
      { name: 'Winston Churchill', role: 'Prime Minister', from: '1940-05-10', to: '1945-07-26', image: '' },
      { name: 'Clement Attlee', role: 'Prime Minister', from: '1945-07-26', to: '1951-10-26', image: '' }
    ]
  },
  {
    name: 'Soviet Union',
    native: '\u0421\u043E\u044E\u0437 \u0421\u043E\u0432\u0435\u0442\u0441\u043A\u0438\u0445 \u0421\u043E\u0446\u0438\u0430\u043B\u0438\u0441\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0445 \u0420\u0435\u0441\u043F\u0443\u0431\u043B\u0438\u043A',
    code: 'SU',
    capital: 'Moscow',
    coords: '55.75040, 37.61734',
    government: 'One-party Marxist\u2013Leninist state',
    flag: wiki('Flag of the Soviet Union (1936\u20131955).svg'),
    leaders: [
      { name: 'Joseph Stalin', role: 'General Secretary of the Communist Party', from: '1922-04-03', to: '1941-05-06', image: '' },
      { name: 'Joseph Stalin', role: 'General Secretary of the Communist Party and Premier', from: '1941-05-06', to: '1953-03-05', image: '' },
      { name: 'Vyacheslav Molotov', role: 'Premier (Chairman of the Council of People\u2019s Commissars)', from: '1930-12-19', to: '1941-05-06', image: '' },
      { name: 'Mikhail Kalinin', role: 'Head of state (Chairman of the Presidium of the Supreme Soviet)', from: '1938-01-17', to: '1946-03-19', image: '' }
    ]
  },
  {
    name: 'United States',
    native: '',
    code: 'US',
    capital: 'Washington, D.C.',
    coords: '38.89511, -77.03637',
    government: 'Federal presidential constitutional republic',
    flag: wiki('Flag of the United States (1912\u20131959).svg'),
    leaders: [
      { name: 'Franklin D. Roosevelt', role: 'President', from: '1933-03-04', to: '1945-04-12', image: '' },
      { name: 'Harry S. Truman', role: 'President', from: '1945-04-12', to: '1953-01-20', image: '' }
    ]
  },
  {
    name: 'Japan',
    native: '\u5927\u65E5\u672C\u5E1D\u570B (Dai Nippon Teikoku)',
    code: 'JP',
    capital: 'Tokyo',
    coords: '35.68950, 139.69171',
    government: 'Constitutional monarchy under a militarist government',
    flag: wiki('Flag of Japan (1870\u20131999).svg'),
    leaders: [
      { name: 'Hirohito', role: 'Emperor', from: '1926-12-25', to: '1989-01-07', image: '' },
      { name: 'Nobuyuki Abe', role: 'Prime Minister', from: '1939-08-30', to: '1940-01-16', image: '' },
      { name: 'Mitsumasa Yonai', role: 'Prime Minister', from: '1940-01-16', to: '1940-07-22', image: '' },
      { name: 'Fumimaro Konoe', role: 'Prime Minister', from: '1940-07-22', to: '1941-10-18', image: '' },
      { name: 'Hideki Tojo', role: 'Prime Minister', from: '1941-10-18', to: '1944-07-22', image: '' },
      { name: 'Kuniaki Koiso', role: 'Prime Minister', from: '1944-07-22', to: '1945-04-07', image: '' },
      { name: 'Kantar\u014D Suzuki', role: 'Prime Minister', from: '1945-04-07', to: '1945-08-17', image: '' }
    ]
  },
  {
    name: 'Poland',
    native: 'Rzeczpospolita Polska',
    code: 'PL',
    capital: 'Warsaw',
    coords: '52.22970, 21.01220',
    government: 'Parliamentary republic under an authoritarian regime',
    flag: wiki('Flag_of_Poland_(1928–1980).svg'),
    leaders: [
      { name: 'Ignacy Mościcki', role: 'President', from: '1926-06-04', to: '1939-09-30', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Ignacy%20Mo%C5%9Bcicki%20(-1934).jpg?width=300' },
      { name: 'Edward Rydz-Śmigły', role: 'Marshal of Poland, Commander-in-Chief', from: '1939-09-01', to: '1939-09-17', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Edward_%C5%9Amig%C5%82y-Rydz_portrait,_1939.png?width=300' }
    ]
  },
  {
    name: 'France',
    native: 'République française',
    code: 'FR',
    capital: 'Paris',
    coords: '48.85347, 2.34835',
    government: 'Parliamentary republic (Third Republic)',
    flag: wiki('Flag_of_France.svg'),
    leaders: [
      { name: 'Albert Lebrun', role: 'President', from: '1932-05-10', to: '1940-07-11', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Albert%20Lebrun%201932%20(2).jpg?width=300' },
      { name: 'Édouard Daladier', role: 'Prime Minister', from: '1938-04-10', to: '1940-03-21', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/%C3%89douard%20Daladier.jpg?width=300' },
      { name: 'Maurice Gamelin', role: 'Commander-in-Chief', from: '1939-09-03', to: '1940-05-19', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Maurice%20Gustave%20Gamelin.jpg?width=300' }
    ]
  },
  {
    name: 'Italy',
    native: 'Regno d\u2019Italia',
    code: 'IT',
    capital: 'Rome',
    coords: '41.89193, 12.51133',
    government: 'Fascist dictatorship under a constitutional monarchy',
    flag: wiki('Flag of Italy (1861–1946).svg'),
    leaders: [
      { name: 'Victor Emmanuel III', role: 'King', from: '1900-07-29', to: '1946-05-09', image: wiki('Vittorio Emanuele III (c. 1924-1934).jpg') },
      { name: 'Benito Mussolini', role: 'Prime Minister (Duce)', from: '1922-10-31', to: '1943-07-25', image: wiki('Mussolini mezzobusto.jpg') },
      { name: 'Galeazzo Ciano', role: 'Minister of Foreign Affairs', from: '1936-06-09', to: '1943-02-05', image: '' }
    ]
  },
  {
    name: 'Spain',
    native: 'Estado Español',
    code: 'ES',
    capital: 'Madrid',
    coords: '40.41650, -3.70256',
    government: 'Francoist dictatorship (one-party Nationalist state; Civil War ended 1 April 1939)',
    flag: wiki('Flag of Spain (1938–1945).svg'),
    leaders: [
      { name: 'Francisco Franco', role: 'Caudillo, Head of State and Prime Minister', from: '1936-10-01', to: '1975-11-20', image: wiki('Francisco Franco 1930 (cropped).jpg') },
      { name: 'Juan Beigbeder', role: 'Minister of Foreign Affairs', from: '1939-08-09', to: '1940-10-16', image: '' }
    ]
  },
  {
    name: 'Portugal',
    native: 'República Portuguesa',
    code: 'PT',
    capital: 'Lisbon',
    coords: '38.72225, -9.13934',
    government: 'Authoritarian one-party corporatist regime (Estado Novo)',
    flag: wiki('Flag of Portugal.svg'),
    leaders: [
      { name: 'Óscar Carmona', role: 'President', from: '1926-11-29', to: '1951-04-18', image: '' },
      { name: 'António de Oliveira Salazar', role: 'President of the Council of Ministers (Prime Minister)', from: '1932-07-05', to: '1968-09-27', image: wiki('Antonio Salazar-1.jpg') }
    ]
  },
  {
    name: 'Ireland',
    native: 'Éire',
    code: 'IE',
    capital: 'Dublin',
    coords: '53.34981, -6.26031',
    government: 'Parliamentary democracy (Éire, 1937 Constitution), neutral',
    flag: wiki('Flag of Ireland.svg'),
    leaders: [
      { name: 'Douglas Hyde', role: 'President', from: '1938-06-25', to: '1945-06-24', image: '' },
      { name: 'Éamon de Valera', role: 'Taoiseach (Prime Minister)', from: '1937-12-29', to: '1948-02-18', image: '' }
    ]
  },
  {
    name: 'Belgium',
    native: 'Belgique / België',
    code: 'BE',
    capital: 'Brussels',
    coords: '50.85034, 4.35171',
    government: 'Constitutional monarchy, parliamentary democracy',
    flag: wiki('Flag of Belgium.svg'),
    leaders: [
      { name: 'Leopold III', role: 'King of the Belgians', from: '1934-02-23', to: '1951-07-16', image: '' },
      { name: 'Hubert Pierlot', role: 'Prime Minister', from: '1939', to: '1945-02-12', image: '' }
    ]
  },
  {
    name: 'Netherlands',
    native: 'Nederland',
    code: 'NL',
    capital: 'Amsterdam',
    coords: '52.37403, 4.88969',
    government: 'Constitutional monarchy, parliamentary democracy',
    flag: wiki('Flag of the Netherlands.svg'),
    leaders: [
      { name: 'Wilhelmina', role: 'Queen', from: '1890-11-23', to: '1948-09-04', image: '' },
      { name: 'Dirk Jan de Geer', role: 'Prime Minister', from: '1939-08-10', to: '1940-09-03', image: '' }
    ]
  },
  {
    name: 'Luxembourg',
    native: 'Lëtzebuerg',
    code: 'LU',
    capital: 'Luxembourg City',
    coords: '49.61167, 6.13000',
    government: 'Constitutional monarchy (Grand Duchy), parliamentary democracy',
    flag: wiki('Flag of Luxembourg.svg'),
    leaders: [
      { name: 'Charlotte', role: 'Grand Duchess', from: '1919-11-15', to: '1964-11-12', image: '' },
      { name: 'Pierre Dupong', role: 'Prime Minister', from: '1937-11-06', to: '1953-12-23', image: '' }
    ]
  },
  {
    name: 'Denmark',
    native: 'Danmark',
    code: 'DK',
    capital: 'Copenhagen',
    coords: '55.67594, 12.56553',
    government: 'Constitutional monarchy, parliamentary democracy',
    flag: wiki('Flag of Denmark.svg'),
    leaders: [
      { name: 'Christian X', role: 'King', from: '1912-05-14', to: '1947-04-20', image: '' },
      { name: 'Thorvald Stauning', role: 'Prime Minister', from: '1929-04-30', to: '1942-05-03', image: '' }
    ]
  },
  {
    name: 'Norway',
    native: 'Norge',
    code: 'NO',
    capital: 'Oslo',
    coords: '59.91273, 10.74609',
    government: 'Constitutional monarchy, parliamentary democracy',
    flag: wiki('Flag of Norway.svg'),
    leaders: [
      { name: 'Haakon VII', role: 'King', from: '1905-11-18', to: '1957-09-21', image: '' },
      { name: 'Johan Nygaardsvold', role: 'Prime Minister', from: '1935-03-20', to: '1945-06-25', image: '' }
    ]
  },
  {
    name: 'Sweden',
    native: 'Sverige',
    code: 'SE',
    capital: 'Stockholm',
    coords: '59.32932, 18.06858',
    government: 'Constitutional monarchy, parliamentary democracy, neutral',
    flag: wiki('Flag of Sweden.svg'),
    leaders: [
      { name: 'Gustaf V', role: 'King', from: '1907-12-08', to: '1950-10-29', image: '' },
      { name: 'Per Albin Hansson', role: 'Prime Minister', from: '1936-06-19', to: '1946-10-06', image: '' }
    ]
  },
  {
    name: 'Finland',
    native: 'Suomi',
    code: 'FI',
    capital: 'Helsinki',
    coords: '60.16952, 24.93545',
    government: 'Parliamentary republic with a strong president',
    flag: wiki('Flag of Finland.svg'),
    leaders: [
      { name: 'Kyösti Kallio', role: 'President', from: '1937-03-01', to: '1940-12-19', image: '' },
      { name: 'Aimo Cajander', role: 'Prime Minister', from: '1937-10-12', to: '1939-12-01', image: '' },
      { name: 'Risto Ryti', role: 'Prime Minister', from: '1939-12-01', to: '1940-03-27', image: '' }
    ]
  },
  {
    name: 'Iceland',
    native: 'Ísland',
    code: 'IS',
    capital: 'Reykjavík',
    coords: '64.13548, -21.89541',
    government: 'Kingdom of Iceland: constitutional monarchy in personal union with Denmark',
    flag: wiki('Flag of Iceland.svg'),
    leaders: [
      { name: 'Christian X', role: 'King of Iceland', from: '1918-12-01', to: '1944-06-17', image: '' },
      { name: 'Hermann Jónasson', role: 'Prime Minister', from: '1934-07-28', to: '1942-11-16', image: '' }
    ]
  },
  {
    name: 'Estonia',
    native: 'Eesti',
    code: 'EE',
    capital: 'Tallinn',
    coords: '59.43696, 24.75357',
    government: 'Authoritarian presidential republic (the “Era of Silence”)',
    flag: wiki('Flag of Estonia.svg'),
    leaders: [
      { name: 'Konstantin Päts', role: 'President', from: '1933', to: '1940-07-21', image: '' },
      { name: 'Kaarel Eenpalu', role: 'Prime Minister', from: '1938-10-12', to: '1939-10-12', image: '' },
      { name: 'Jüri Uluots', role: 'Prime Minister', from: '1939-10-12', to: '1940-06-21', image: '' }
    ]
  },
  {
    name: 'Latvia',
    native: 'Latvija',
    code: 'LV',
    capital: 'Riga',
    coords: '56.94600, 24.10589',
    government: 'Authoritarian one-man regime (Ulmanis, since the 1934 coup)',
    flag: wiki('Flag of Latvia.svg'),
    leaders: [
      { name: 'Kārlis Ulmanis', role: 'President and Prime Minister', from: '1934-03-17', to: '1940-06-20', image: '' }
    ]
  },
  {
    name: 'Lithuania',
    native: 'Lietuva',
    code: 'LT',
    capital: 'Kaunas',
    coords: '54.89870, 23.90360',
    government: 'Authoritarian one-party regime (Nationalist Union); Kaunas is the provisional capital',
    flag: wiki('Flag of Lithuania (1918–1940).svg'),
    leaders: [
      { name: 'Antanas Smetona', role: 'President', from: '1926-12-19', to: '1940-06-15', image: '' },
      { name: 'Jonas Černius', role: 'Prime Minister', from: '1939-03-28', to: '1939-11-21', image: '' },
      { name: 'Antanas Merkys', role: 'Prime Minister', from: '1939-11-21', to: '1940-06-17', image: '' }
    ]
  },
  {
    name: 'Switzerland',
    native: 'Schweiz / Suisse / Svizzera',
    code: 'CH',
    capital: 'Bern',
    coords: '46.94809, 7.44744',
    government: 'Federal directorial republic (Federal Council), neutral',
    flag: wiki('Flag of Switzerland.svg'),
    leaders: [
      { name: 'Philipp Etter', role: 'President of the Swiss Confederation (Federal Council)', from: '1939-01-01', to: '1940-01-01', image: '' }
    ]
  },
  {
    name: 'Liechtenstein',
    native: '',
    code: 'LI',
    capital: 'Vaduz',
    coords: '47.14151, 9.52154',
    government: 'Constitutional monarchy (principality)',
    flag: wiki('Flag of Liechtenstein.svg'),
    leaders: [
      { name: 'Franz Joseph II', role: 'Prince', from: '1938-07-25', to: '1989-11-13', image: '' },
      { name: 'Josef Hoop', role: 'Head of Government', from: '1928-09-03', to: '1945-09-03', image: '' }
    ]
  },
  {
    name: 'Monaco',
    native: '',
    code: 'MC',
    capital: 'Monaco',
    coords: '43.73841, 7.42461',
    government: 'Hereditary principality (monarchy)',
    flag: wiki('Flag of Monaco.svg'),
    leaders: [
      { name: 'Louis II', role: 'Sovereign Prince', from: '1922-06-02', to: '1949-05-09', image: '' },
      { name: 'Émile Roblot', role: 'Minister of State', from: '1937', to: '1944', image: '' }
    ]
  },
  {
    name: 'Andorra',
    native: '',
    code: 'AD',
    capital: 'Andorra la Vella',
    coords: '42.50631, 1.52180',
    government: 'Parliamentary co-principality (two co-princes)',
    flag: wiki('Flag of Andorra.svg'),
    leaders: [
      { name: 'Albert Lebrun', role: 'French Co-Prince (President of France)', from: '1932-05-10', to: '1940-07-11', image: wiki('Albert Lebrun 1932 (2).jpg') },
      { name: 'Justí Guitart i Vilardebó', role: 'Episcopal Co-Prince (Bishop of Urgell)', from: '1920', to: '1940', image: '' }
    ]
  },
  {
    name: 'San Marino',
    native: '',
    code: 'SM',
    capital: 'San Marino',
    coords: '43.93667, 12.44639',
    government: 'Republic led by two Captains Regent (Fascist Party in power)',
    flag: wiki('Flag of San Marino.svg'),
    leaders: [
      { name: 'Pompeo Righi', role: 'Captain Regent', from: '1939-04-01', to: '1939-10-01', image: '' },
      { name: 'Marino Morri', role: 'Captain Regent', from: '1939-04-01', to: '1939-10-01', image: '' }
    ]
  },
  {
    name: 'Vatican City',
    native: 'Città del Vaticano',
    code: 'VA',
    capital: 'Vatican City',
    coords: '41.90217, 12.45337',
    government: 'Absolute elective monarchy (Holy See)',
    flag: wiki('Flag of the Vatican City.svg'),
    leaders: [
      { name: 'Pius XII', role: 'Pope', from: '1939-03-02', to: '1958-10-09', image: '' },
      { name: 'Luigi Maglione', role: 'Cardinal Secretary of State', from: '1939-03-10', to: '1944-08-22', image: '' }
    ]
  },
  {
    name: 'Hungary',
    native: 'Magyar Királyság',
    code: 'HU',
    capital: 'Budapest',
    coords: '47.49801, 19.03991',
    government: 'Regency (kingdom without a king), authoritarian parliamentary system',
    flag: wiki('Flag of Hungary.svg'),
    leaders: [
      { name: 'Miklós Horthy', role: 'Regent', from: '1920-03-01', to: '1944-10-16', image: '' },
      { name: 'Pál Teleki', role: 'Prime Minister', from: '1939-02-16', to: '1941-04-03', image: '' }
    ]
  },
  {
    name: 'Romania',
    native: 'Regatul României',
    code: 'RO',
    capital: 'Bucharest',
    coords: '44.43225, 26.10626',
    government: 'Royal dictatorship (since 1938)',
    flag: wiki('Flag of Romania.svg'),
    leaders: [
      { name: 'Carol II', role: 'King', from: '1930-06-08', to: '1940-09-06', image: '' },
      { name: 'Armand Călinescu', role: 'Prime Minister', from: '1939-03-07', to: '1939-09-21', image: '' }
    ]
  },
  {
    name: 'Bulgaria',
    native: 'Царство България',
    code: 'BG',
    capital: 'Sofia',
    coords: '42.69751, 23.32415',
    government: 'Authoritarian monarchy (royal dictatorship, since 1935)',
    flag: wiki('Flag of Bulgaria.svg'),
    leaders: [
      { name: 'Boris III', role: 'Tsar', from: '1918-10-03', to: '1943-08-28', image: '' },
      { name: 'Georgi Kyoseivanov', role: 'Prime Minister', from: '1935-11-22', to: '1940-02-15', image: '' }
    ]
  },
  {
    name: 'Yugoslavia',
    native: 'Краљевина Југославија',
    code: 'YU',
    capital: 'Belgrade',
    coords: '44.80401, 20.46513',
    government: 'Constitutional monarchy under a regency',
    flag: wiki('Flag of Yugoslavia (1918–1943).svg'),
    leaders: [
      { name: 'Peter II', role: 'King (a minor)', from: '1934-10-09', to: '1945-11-29', image: '' },
      { name: 'Prince Paul', role: 'Regent', from: '1934-10-09', to: '1941-03-27', image: '' },
      { name: 'Dragiša Cvetković', role: 'Prime Minister', from: '1939-02-05', to: '1941-03-27', image: '' }
    ]
  },
  {
    name: 'Greece',
    native: 'Βασίλειον τῆς Ἑλλάδος',
    code: 'GR',
    capital: 'Athens',
    coords: '37.98381, 23.72754',
    government: 'Authoritarian monarchy (4th of August Regime)',
    flag: wiki('Flag of Greece (1822-1978).svg'),
    leaders: [
      { name: 'George II', role: 'King of the Hellenes', from: '1935-11-25', to: '1947-04-01', image: '' },
      { name: 'Ioannis Metaxas', role: 'Prime Minister (dictator)', from: '1936-04-13', to: '1941-01-29', image: '' }
    ]
  },
  {
    name: 'Albania',
    native: 'Mbretëria Shqiptare',
    code: 'AL',
    capital: 'Tirana',
    coords: '41.32754, 19.81889',
    government: 'Italian protectorate: kingdom in personal union with Italy (since 7–16 April 1939)',
    flag: wiki('Flag of Albania (1939–1943).svg'),
    leaders: [
      { name: 'Victor Emmanuel III', role: 'King of the Albanians', from: '1939-04-16', to: '1943-09-08', image: wiki('Vittorio Emanuele III (c. 1924-1934).jpg') },
      { name: 'Francesco Jacomoni', role: 'Lieutenant-General (Italian viceroy)', from: '1939-04-16', to: '1943', image: '' },
      { name: 'Shefqet Vërlaci', role: 'Prime Minister', from: '1939-04-12', to: '1941', image: '' }
    ]
  },
  {
    name: 'Protectorate of Bohemia and Moravia',
    native: 'Protektorát Čechy a Morava',
    code: 'CZ',
    capital: 'Prague',
    coords: '50.08804, 14.42076',
    government: 'German protectorate with nominal autonomy (since 15 March 1939)',
    flag: wiki('Flag of the Protectorate of Bohemia and Moravia.svg'),
    leaders: [
      { name: 'Emil Hácha', role: 'State President', from: '1938-11-30', to: '1945-05-09', image: '' },
      { name: 'Konstantin von Neurath', role: 'Reich Protector (German governor)', from: '1939-03-18', to: '1943-08-24', image: '' },
      { name: 'Alois Eliáš', role: 'Prime Minister', from: '1939-04-27', to: '1941-09-28', image: '' }
    ]
  },
  {
    name: 'Slovakia',
    native: 'Slovenská republika',
    code: 'SK',
    capital: 'Bratislava',
    coords: '48.14816, 17.10674',
    government: 'One-party clerical-nationalist client state of Germany (independent since 14 March 1939)',
    flag: wiki('Flag of Slovakia (1939–1945).svg'),
    leaders: [
      { name: 'Jozef Tiso', role: 'Prime Minister', from: '1939-03-14', to: '1939-10-26', image: '' },
      { name: 'Jozef Tiso', role: 'President', from: '1939-10-26', to: '1945-04-04', image: '' },
      { name: 'Vojtech Tuka', role: 'Prime Minister', from: '1940-07-27', to: '1944-09-05', image: '' }
    ]
  },
];

// ---------------------------------------------------------------------------
//  Everything below is code. You normally don't need to edit it.
//  Uses mk(), parseLatLng() and safeUrl() from js/markers.js.
// ---------------------------------------------------------------------------

// Image link from the data -> something safe to put in <img src>, or null
function countryImg(src) {
  const s = String(src || '').trim();
  if (!s) return null;
  if (/^https?:/i.test(s)) return safeUrl(s);
  return /^[a-z][a-z0-9+.-]*:/i.test(s) ? null : s;   // a path inside the site folder
}

// ---- What was true on the date of the selected map year ----
// 'YYYY' or 'YYYY-MM-DD' -> comparable 'YYYY-MM-DD'
const isoDay = d => /^\d{4}$/.test(String(d)) ? d + '-01-01' : String(d || '');

// The date the Historical Borders buttons stand on, or '' if borders.js is missing
function mapDate() {
  return (typeof borderIsoDate === 'function' && typeof selectedBorderYear !== 'undefined')
    ? borderIsoDate(selectedBorderYear) : '';
}
function mapDateLabel() {
  return (typeof borderDate === 'function' && typeof selectedBorderYear !== 'undefined')
    ? borderDate(selectedBorderYear) : '';
}

// from <= date < to ; with no date known, everything counts
const inEffect = (e, date) =>
  !date || ((!e.from || isoDay(e.from) <= date) && (!e.to || date < isoDay(e.to)));

function governmentOn(c, date) {
  if (typeof c.government === 'string') return c.government;
  const hit = (c.government || []).find(g => inEffect(g, date));
  return hit ? hit.text : '';
}
const leadersOn = (c, date) => (c.leaders || []).filter(l => l && l.name && inEffect(l, date));

// '1933\u20131945', 'since 1926' ... (or the leader's own `years` text)
function leaderYears(l) {
  if (l.years) return l.years;
  const a = l.from ? String(l.from).slice(0, 4) : '';
  const b = l.to ? String(l.to).slice(0, 4) : '';
  return a && b ? (a === b ? a : a + '\u2013' + b) : a ? 'since ' + a : b ? 'until ' + b : '';
}

// <img> for a flag, or a box with the country code if there is no image / it fails
function flagImg(c, cls) {
  const placeholder = () => {
    const d = mk('div', cls + ' no-img');
    d.textContent = c.code || String(c.name || '?').slice(0, 2).toUpperCase();
    return d;
  };
  const src = countryImg(c.flag);
  if (!src) return placeholder();
  const img = mk('img', cls);
  img.alt = 'Flag of ' + (c.name || 'country');
  img.addEventListener('error', () => img.replaceWith(placeholder()));
  img.src = src;
  return img;
}

// Portrait of a leader, or their initials
function personImg(l) {
  const placeholder = () => {
    const d = mk('div', 'cleader-img no-img');
    d.textContent = String(l.name || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    return d;
  };
  const src = countryImg(l.image);
  if (!src) return placeholder();
  const img = mk('img', 'cleader-img');
  img.alt = l.name || '';
  img.addEventListener('error', () => img.replaceWith(placeholder()));
  img.src = src;
  return img;
}

// ---- Waving flag, drawn on a small canvas ----
const FLAG_W = 40, FLAG_H = 26, FLAG_PAD = 3;   // CSS pixels; the padding leaves room for the wave

function makeFlagCanvas(c, index, still) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = mk('canvas', 'flagm-canvas');
  canvas.width = Math.round(FLAG_W * dpr);
  canvas.height = Math.round((FLAG_H + FLAG_PAD * 2) * dpr);
  canvas.style.width = FLAG_W + 'px';
  canvas.style.height = (FLAG_H + FLAG_PAD * 2) + 'px';
  const f = { canvas, ctx: canvas.getContext('2d'), dpr, img: null, ok: false, still, phase: index * 1.7, code: c.code || '' };
  const src = countryImg(c.flag);
  if (src) {
    const img = new Image();
    img.onload = () => { f.ok = img.naturalWidth > 0; drawFlag(f, 0); };
    img.onerror = () => { f.ok = false; drawFlag(f, 0); };
    img.src = src;
    f.img = img;
  }
  drawFlag(f, 0);
  return f;
}

function drawFlag(f, t) {
  const { ctx, canvas, dpr } = f;
  const W = canvas.width, H = canvas.height;
  const pad = FLAG_PAD * dpr, fh = FLAG_H * dpr;
  ctx.clearRect(0, 0, W, H);

  if (!f.ok) {                                   // no image (yet): grey box with the country code
    ctx.fillStyle = '#2b2b30';
    ctx.fillRect(0, pad, W, fh);
    ctx.fillStyle = '#9a9aa2';
    ctx.font = '600 ' + (11 * dpr) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(f.code || '?', W / 2, pad + fh / 2);
    return;
  }
  if (f.still) {                                 // reduced motion: a flat flag
    ctx.drawImage(f.img, 0, pad, W, fh);
    return;
  }

  const iw = f.img.naturalWidth, ih = f.img.naturalHeight;
  const sw = Math.max(iw / W, 1);
  for (let x = 0; x < W; x++) {
    const k = x / W;                             // 0 at the pole, 1 at the free edge: the wave grows outwards
    const a = (x / dpr) * 0.32 - t * 3.2 + f.phase;
    const y = pad + Math.sin(a) * 2.4 * dpr * k;
    ctx.drawImage(f.img, Math.min(k * iw, iw - sw), 0, sw, ih, x, y, 1, fh);
    const s = Math.cos(a) * 0.22 * k;            // light and shadow on the folds
    ctx.fillStyle = s > 0 ? 'rgba(0,0,0,' + s + ')' : 'rgba(255,255,255,' + (-s * 0.6) + ')';
    ctx.fillRect(x, y, 1, fh);
  }
}

function buildFlagMarker(c, f, onClick) {
  const b = mk('button', 'flagm');
  b.type = 'button';
  b.title = c.name;
  b.setAttribute('aria-label', 'Open ' + c.name);
  b.append(mk('span', 'flagm-pole'), f.canvas, mk('span', 'flagm-base'));
  b.addEventListener('click', e => { e.stopPropagation(); onClick(); });
  return b;
}

// ---- The panel that opens for one country ----
function createCountryModal() {
  const back = mk('div', 'vmodal');
  back.hidden = true;
  const panel = mk('div', 'vmodal-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Country');

  const close = mk('button', 'vmodal-close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '\u2715';

  const body = mk('div', 'cbody');
  panel.append(close, body);
  back.append(panel);
  document.body.append(back);

  const FADE_MS = 260; // keep in sync with the .vmodal CSS transition
  let opener = null;
  let closeTimer = null;
  const isOpen = () => back.classList.contains('open');
  const hide = () => {
    if (!isOpen()) return;
    back.classList.remove('open');
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { back.hidden = true; }, FADE_MS);
    if (opener && opener.focus) opener.focus({ preventScroll: true });
  };
  close.addEventListener('click', hide);
  back.addEventListener('mousedown', e => { if (e.target === back) hide(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });

  let current = null;                 // the country being shown

  // Fills the panel with what was true on the date of the selected map year
  const render = c => {
    const date = mapDate();

    const head = mk('div', 'chead');
    const names = mk('div', 'cnames');
    const name = mk('h2', 'cname');
    name.textContent = c.name || 'Unknown';
    names.append(name);
    if (c.native && c.native !== c.name) {
      const n = mk('div', 'cnative');
      n.textContent = c.native;
      names.append(n);
    }
    const gov = governmentOn(c, date);
    if (gov) {
      const g = mk('div', 'cgov');
      g.textContent = gov;
      names.append(g);
    }
    if (c.capital) {
      const cap = mk('div', 'ccap');
      cap.textContent = 'Capital: ' + c.capital;
      names.append(cap);
    }
    head.append(flagImg(c, 'cflag'), names);
    body.replaceChildren(head);

    const label = mapDateLabel();
    if (label) {
      const when = mk('div', 'cdate');
      const strong = mk('strong');
      strong.textContent = label;
      when.append('Situation on ', strong);
      body.append(when);
    }

    const leaders = leadersOn(c, date);
    const title = mk('div', 'csec');
    title.textContent = leaders.length === 1 ? 'Leader' : 'Leaders';
    body.append(title);
    if (!leaders.length) {
      const none = mk('div', 'cnone');
      none.textContent = 'No leaders listed for this date.';
      body.append(none);
      return;
    }
    const grid = mk('div', 'cleaders');
    leaders.forEach(l => {
      const card = mk('div', 'cleader');
      const info = mk('div', 'cleader-info');
      const n = mk('div', 'cleader-name');
      n.textContent = l.name;
      info.append(n);
      if (l.role) {
        const r = mk('div', 'cleader-role');
        r.textContent = l.role;
        info.append(r);
      }
      const years = leaderYears(l);
      if (years) {
        const y = mk('div', 'cleader-years');
        y.textContent = years;
        info.append(y);
      }
      card.append(personImg(l), info);
      grid.append(card);
    });
    body.append(grid);
  };

  // The year buttons of Historical Borders were pressed
  document.addEventListener('borderyearchange', () => {
    if (isOpen() && current) render(current);
  });

  return {
    open(c, fromEl) {
      opener = fromEl || null;
      current = c;
      clearTimeout(closeTimer);
      render(c);
      body.scrollTop = 0;
      back.hidden = false;
      void back.offsetWidth;
      back.classList.add('open');
      close.focus({ preventScroll: true });
    }
  };
}

// ---- Called from addVideoPlaces() in js/markers.js ----
//   panelRoot: the left "Videos" panel     goTo(pos): moves the map to {lat, lng}
function initCountries(map, panelRoot, goTo) {
  if (!panelRoot || typeof COUNTRIES === 'undefined') return;
  const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const modal = createCountryModal();

  // One flag on every capital
  const items = [];
  COUNTRIES.forEach((c, i) => {
    const pos = parseLatLng(c.coords);
    if (!pos) { console.warn('Country #' + (i + 1) + ' (' + (c.name || '?') + '): bad coords', c.coords); return; }
    const f = makeFlagCanvas(c, items.length, reduced);
    const el = buildFlagMarker(c, f, () => modal.open(c, el));
    new maplibregl.Marker({ element: el, anchor: 'bottom-left' })
      .setLngLat([pos.lng, pos.lat])
      .addTo(map);
    items.push({ c, pos, f });
  });

  // Animation: runs only while Countries mode is on
  let raf = 0;
  const tick = ts => {
    items.forEach(it => drawFlag(it.f, ts / 1000));
    raf = requestAnimationFrame(tick);
  };
  const startFlags = () => {
    if (reduced) { items.forEach(it => drawFlag(it.f, 0)); return; }
    if (!raf) raf = requestAnimationFrame(tick);
  };
  const stopFlags = () => { cancelAnimationFrame(raf); raf = 0; };

  // ----- the Videos / Countries button -----
  const title = panelRoot.querySelector('.vpanel-title');
  const videoCount = panelRoot.querySelector('.vpanel-head .vmodal-count');
  const countryCount = mk('span', 'vmodal-count countries-count');
  countryCount.textContent = String(items.length);
  if (videoCount) videoCount.after(countryCount);

  const toggle = mk('button', 'cmode');
  toggle.type = 'button';
  const vWord = mk('span');
  vWord.textContent = 'Videos';
  const cWord = mk('span');
  cWord.textContent = 'Countries';
  toggle.append(vWord, ' / ', cWord);
  const videoTools = panelRoot.querySelector('.vpanel-tools');
  panelRoot.insertBefore(toggle, videoTools);

  // ----- the country list (replaces the video list in Countries mode) -----
  const tools = mk('div', 'ctools');
  const search = mk('input', 'vpanel-search');
  search.type = 'search';
  search.placeholder = 'Search countries';
  search.setAttribute('aria-label', 'Search countries');
  tools.append(search);

  const list = mk('div', 'vpanel-list clist');

  const rowEl = it => {
    const { c, pos } = it;
    const row = mk('div', 'crow');
    const flagBtn = mk('button', 'crow-flagbtn');
    flagBtn.type = 'button';
    flagBtn.setAttribute('aria-label', 'Open ' + c.name);
    flagBtn.append(flagImg(c, 'crow-flag'));
    flagBtn.addEventListener('click', () => modal.open(c, flagBtn));

    const body = mk('div', 'crow-body');
    const name = mk('button', 'crow-name');
    name.type = 'button';
    name.textContent = c.name;
    name.addEventListener('click', () => modal.open(c, name));
    body.append(name);
    if (c.native && c.native !== c.name) {
      const n = mk('div', 'crow-native');
      n.textContent = c.native;
      body.append(n);
    }
    const go = mk('button', 'vitem-go');
    go.type = 'button';
    go.textContent = 'Show on map';
    go.addEventListener('click', () => goTo(pos));
    body.append(go);

    row.append(flagBtn, body);
    return row;
  };

  const render = () => {
    const q = search.value.trim().toLowerCase();
    const shown = items.filter(it =>
      !q || [it.c.name, it.c.native, it.c.capital, it.c.government].join(' ').toLowerCase().includes(q));
    const frag = document.createDocumentFragment();
    if (!shown.length) {
      const empty = mk('div', 'vpanel-empty');
      empty.textContent = items.length ? 'No countries match.' : 'No countries yet. Add them in js/countries.js.';
      frag.append(empty);
    } else {
      shown.forEach(it => frag.append(rowEl(it)));
    }
    list.replaceChildren(frag);
    list.scrollTop = 0;
  };
  search.addEventListener('input', render);
  render();
  panelRoot.append(tools, list);

  // ----- switching -----
  let mode = 'videos';
  const setMode = m => {
    mode = m;
    const on = m === 'countries';
    panelRoot.classList.toggle('mode-countries', on);
    map.getContainer().classList.toggle('countries-mode', on);
    if (title) title.textContent = on ? 'Countries' : 'Videos';
    vWord.classList.toggle('on', !on);
    cWord.classList.toggle('on', on);
    toggle.setAttribute('aria-label', on ? 'Switch to Videos' : 'Switch to Countries');
    if (on) startFlags(); else stopFlags();
  };
  toggle.addEventListener('click', () => setMode(mode === 'videos' ? 'countries' : 'videos'));
  setMode('videos');
}