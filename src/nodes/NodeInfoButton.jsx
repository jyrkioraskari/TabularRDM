import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

const instructions = {
  tabularFile: {
    en: {
      title: 'Tabular file',
      steps: [
        'Select a spreadsheet or CSV file from your computer.',
        'The loaded workbook is parsed and sent to connected preview, column description, and RO-Crate nodes.',
        'Use the export_config sheet to provide RO-Crate metadata such as dataset title, description, and license.',
      ],
    },
    de: {
      title: 'Tabellendatei',
      steps: [
        'Wahle eine Tabellen- oder CSV-Datei von deinem Computer aus.',
        'Die geladene Arbeitsmappe wird analysiert und an verbundene Vorschau-, Spaltenbeschreibungs- und RO-Crate-Knoten weitergegeben.',
        'Nutze das Tabellenblatt export_config fur RO-Crate-Metadaten wie Titel, Beschreibung und Lizenz.',
      ],
    },
  },
  previewTabular: {
    en: {
      title: 'Preview tabular data',
      steps: [
        'Connect a Tabular file node to inspect the first rows of the loaded sheet.',
        'Use this node to verify headers and cell values before creating metadata.',
      ],
    },
    de: {
      title: 'Tabellendaten-Vorschau',
      steps: [
        'Verbinde einen Tabellendatei-Knoten, um die ersten Zeilen des geladenen Tabellenblatts zu prufen.',
        'Nutze diesen Knoten, um Kopfzeilen und Zellwerte vor der Metadatenerstellung zu kontrollieren.',
      ],
    },
  },
  columnDescription: {
    en: {
      title: 'Column description',
      steps: [
        'Connect a Tabular file node to populate the table headers.',
        'Write a short description for each column.',
        'Drag units from a Units node into the Unit column when a measured value needs a unit.',
        'The node serializes the descriptions as RDF for RDF Store and RO-Crate nodes.',
      ],
    },
    de: {
      title: 'Spaltenbeschreibung',
      steps: [
        'Verbinde einen Tabellendatei-Knoten, um die Kopfzeilen zu laden.',
        'Ergaenze fur jede Spalte eine kurze Beschreibung.',
        'Ziehe Einheiten aus einem Einheiten-Knoten in die Einheitenspalte, wenn Messwerte eine Einheit brauchen.',
        'Der Knoten serialisiert die Beschreibungen als RDF fur RDF Store und RO-Crate.',
      ],
    },
  },
  quantityKind: {
    en: {
      title: 'Quantity kinds',
      steps: [
        'Search or browse QUDT quantity kinds in the selected language.',
        'Select a quantity kind to filter connected Units nodes.',
      ],
    },
    de: {
      title: 'Groessenarten',
      steps: [
        'Durchsuche QUDT-Groessenarten in der gewahlten Sprache.',
        'Wahle eine Groessenart aus, um verbundene Einheiten-Knoten zu filtern.',
      ],
    },
  },
  unit: {
    en: {
      title: 'Units',
      steps: [
        'Search or browse QUDT units in the selected language.',
        'Connect a Quantity Kinds node to filter this list.',
        'Drag a unit into a Column Description unit field to assign it to a column.',
      ],
    },
    de: {
      title: 'Einheiten',
      steps: [
        'Durchsuche QUDT-Einheiten in der gewahlten Sprache.',
        'Verbinde einen Groessenarten-Knoten, um die Liste zu filtern.',
        'Ziehe eine Einheit in ein Einheitenfeld der Spaltenbeschreibung.',
      ],
    },
  },
  profileSearch: {
    en: {
      title: 'Metadata profile search',
      steps: [
        'Search AIMS for a metadata application profile.',
        'Connect this node to a Metadata Form node.',
        'Select a result to load its SHACL form into the connected Metadata Form.',
      ],
    },
    de: {
      title: 'Metadatenprofil-Suche',
      steps: [
        'Suche in AIMS nach einem Metadaten-Anwendungsprofil.',
        'Verbinde diesen Knoten mit einem Metadatenformular-Knoten.',
        'Wahle ein Ergebnis aus, um das SHACL-Formular in das verbundene Metadatenformular zu laden.',
      ],
    },
  },
  metadataForm: {
    en: {
      title: 'Metadata form',
      steps: [
        'Use the loaded SHACL form to enter dataset metadata.',
        'Forms can come from Metadata Profile Search or from a connected Coscine node.',
        'Save the form to emit RDF for RDF Store and RO-Crate nodes.',
      ],
    },
    de: {
      title: 'Metadatenformular',
      steps: [
        'Trage Datensatz-Metadaten in das geladene SHACL-Formular ein.',
        'Formulare konnen aus der Metadatenprofil-Suche oder aus einem verbundenen Coscine-Knoten kommen.',
        'Speichere das Formular, um RDF fur RDF Store und RO-Crate auszugeben.',
      ],
    },
  },
  rdfStore: {
    en: {
      title: 'RDF Store',
      steps: [
        'Connect metadata-producing nodes to collect their Turtle RDF.',
        'Review the loaded triples and preview the Turtle content.',
        'Download metadata.ttl when you need the combined RDF file.',
      ],
    },
    de: {
      title: 'RDF Store',
      steps: [
        'Verbinde Metadaten-Knoten, um deren Turtle-RDF zu sammeln.',
        'Prufe die geladenen Tripel und die Turtle-Vorschau.',
        'Lade metadata.ttl herunter, wenn du die kombinierte RDF-Datei brauchst.',
      ],
    },
  },
  roCrate: {
    en: {
      title: 'RO-Crate',
      steps: [
        'Connect RDF and tabular workflow nodes to package their outputs.',
        'Download the RO-Crate ZIP locally or connect this node to Coscine for upload.',
      ],
    },
    de: {
      title: 'RO-Crate',
      steps: [
        'Verbinde RDF- und Tabellendaten-Knoten, um deren Ausgaben zu paketieren.',
        'Lade das RO-Crate-ZIP lokal herunter oder verbinde diesen Knoten mit Coscine fur den Upload.',
      ],
    },
  },
  coscine: {
    en: {
      title: 'Coscine',
      steps: [
        'Enter a Coscine API token and load your accessible resources.',
        'Select a resource to load its associated SHACL form.',
        'Connect Coscine to a Metadata Form node to send that form there.',
        'Connect an RO-Crate node to upload the generated ZIP resource to the selected Coscine resource.',
      ],
    },
    de: {
      title: 'Coscine',
      steps: [
        'Gib ein Coscine-API-Token ein und lade deine erreichbaren Ressourcen.',
        'Wahle eine Ressource aus, um das zugehorige SHACL-Formular zu laden.',
        'Verbinde Coscine mit einem Metadatenformular, um dieses Formular dorthin zu senden.',
        'Verbinde einen RO-Crate-Knoten, um die erzeugte ZIP-Ressource in die gewahlte Coscine-Ressource hochzuladen.',
      ],
    },
  },
};

const fallbackCopy = {
  en: {
    title: 'Node help',
    close: 'Close',
  },
  de: {
    title: 'Knotenhilfe',
    close: 'Schliessen',
  },
};

export default function NodeInfoButton({ nodeType, language = 'en' }) {
  const [isOpen, setIsOpen] = useState(false);
  const copy = fallbackCopy[language] ?? fallbackCopy.en;
  const content = useMemo(() => {
    const nodeInstructions = instructions[nodeType] ?? {};
    return nodeInstructions[language] ?? nodeInstructions.en ?? {
      title: copy.title,
      steps: [],
    };
  }, [copy.title, language, nodeType]);

  return (
    <>
      <button
        type="button"
        className="node-info-button nodrag"
        aria-label={content.title}
        title={content.title}
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen(true);
        }}
      >
        i
      </button>
      {isOpen ? createPortal(
        <div
          className="node-info-modal nodrag nopan"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`node-info-title-${nodeType}`}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div
            className="node-info-modal__backdrop"
            onClick={() => setIsOpen(false)}
          />
          <div className="node-info-modal__panel">
            <h2 id={`node-info-title-${nodeType}`}>{content.title}</h2>
            <ol>
              {content.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <button
              type="button"
              className="node-info-modal__close"
              onClick={() => setIsOpen(false)}
            >
              {copy.close}
            </button>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
