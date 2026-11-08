PRISON ESCAPE - TEST 8: PIXELART-INTRO & RANDOM-LEVELS
========================================================

STARTEN
-------
Doppelklick auf index.html. Das Spiel laeuft direkt im Browser; fuer
eine lokale Vorschau kann der Ordner mit VS Code / Live Server
geoeffnet werden. index.html, style.css und game.js gehoeren zusammen.

VORSPIEL
--------
- Ein neues Spiel beginnt vor Gericht und zeigt vier animierte Szenen:
  Verhandlung, Urteil, Fahrt zum Gefaengnis und Ankunft in der Zelle.
- Die Figuren stehen auf sichtbaren Boeden und Podesten. Der Goblin wird
  zum Richter gefuehrt, bewegt sich im bewachten Wagen und geht bei der
  Ankunft ueber eine Rampe in die Zelle; die Wache schliesst danach das Gitter.
- Gerichtsszenen behalten denselben Bildausschnitt. Eine kurze Schwarzblende
  macht Ortswechsel bewusst, statt Figuren unvermittelt erscheinen zu lassen.
- Die Szenen laufen automatisch weiter. Mit „Weiter“ oder Enter geht es
  zur naechsten Szene; „Ueberspringen“ oder Escape startet sofort Level 1.
- Das Intro wird beim Start als gesehen gespeichert. „Fortsetzen“ geht
  direkt zum gespeicherten Level und spielt das Vorspiel nicht erneut ab.

NEU AUS TEST 5
--------------
- Stacheln sind kleiner gezeichnet und haben eine schmalere
  Kollisionsflaeche. Die Stachelgruppen sind hoechstens zwei Felder breit
  und mit dem normalen Sprung ueberspringbar.
- Bei "Spielen" wird ein neuer Zufalls-Seed erzeugt. Er mischt die
  Positionen von Stacheln, Wachen und Checkpoints in allen acht Levels.
- Der Seed wird mit dem Spielfortschritt gespeichert: Fortsetzen behaelt
  dieselben Layouts. Ein neues Spiel erstellt eine andere Runde.
- Schluessel und Hebel liegen immer vor der zugehoerigen Tuer bzw. dem
  Gitter; Ziele und sichere Laufwege bleiben offen.
- Die 50 x 50 Pixel-Sprites, Pixelpalette und acht langen Zufallslevel
  bleiben erhalten.

STEUERUNG
---------
A / Pfeil links       nach links laufen
D / Pfeil rechts      nach rechts laufen
Leertaste             springen (halten fuer einen hoeheren Sprung)
E                     Hebel benutzen oder Tueren oeffnen
E gedrueckt halten    Schloss knacken, falls kein Schluessel da ist
ESC                   Pause

Wachen und Stacheln sind gefaehrlich. Checkpoints, Level-Fortschritt,
Intro-Status und Optionen werden im Browser gespeichert. Das Spiel kann
online direkt im Browser ueber GitHub Pages aufgerufen werden. Im Hauptmenue
"Spielen" startet das Vorspiel und eine neue zufaellig gemischte Runde;
"Fortsetzen" laedt den gespeicherten Fortschritt ohne das Intro.
Test 8 verwendet einen eigenen Browser-Speicher und veraendert keine
Spielstaende aus Test 1 bis 7.

DATEIEN
-------
index.html   Spieleinstieg und Menues
style.css    Menue, Intro und Pixel-Darstellung
game.js      Spielregeln, Vorspiel, Pixel-Sprites und Zufallslevel

Viel Spass beim Ausbrechen!
