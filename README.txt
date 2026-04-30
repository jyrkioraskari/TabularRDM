TabulatRDM
==========

TabulatRDM is a React Flow application for building a small tabular research
data workflow. Users can load spreadsheet data, preview columns, describe those
columns, create RDF metadata, inspect RDF in a store, and export an RO-Crate ZIP.

Running the app
---------------

Install dependencies:

  npm install

Start the Vite development server:

  npm run dev

Build the production bundle:

  npm run build

Serve the built app with the local Node server:

  npm run serve

The production server serves files from dist/ and proxies /qudt requests to
https://qudt.org so QUDT vocabulary data can be fetched without browser CORS
issues.

Main files
----------

package.json
  Defines the Vite scripts and runtime dependencies. Important libraries include
  React, React Flow, xlsx, rdfstore, ro-crate, and jszip.

server.js
  Minimal static file server for the production build. It also provides the
  /qudt proxy used by the QUDT service.

vite.config.js
  Vite configuration for the React app.

index.html
  Vite HTML entry point.

src/main.jsx
  Mounts the React application.

src/App.jsx
  Main workflow canvas. It defines node templates, connection behavior, data
  propagation between nodes, spreadsheet parsing, RDF propagation, and RO-Crate
  input propagation.

src/styles.css
  Application-wide styles for the canvas, sidebar, and custom node UI.

Node files
----------

src/nodes/TabularFileNode.jsx
  File input node. Reads a selected CSV or spreadsheet file as an ArrayBuffer and
  passes it to App.jsx.

src/nodes/PreviewTabularDataNode.jsx
  Displays a preview table for the connected tabular file.

src/nodes/ColumnDescriptionNode.jsx
  Lets users enter descriptions for detected columns. Units are assigned only by
  dragging a unit from the Units node. Changes are serialized to RDF
  automatically; there is no manual save button.

src/nodes/QuantityKindNode.jsx
  Lets users search and select QUDT quantity kinds.

src/nodes/UnitNode.jsx
  Lets users search QUDT units, filtered by a selected quantity kind when
  connected. Unit selections can be dragged into Column Description unit fields.

src/nodes/MetadataProfileSearchNode.jsx
  Searches AIMS metadata profiles and passes selected profile information to a
  connected Metadata Form node.

src/nodes/MetadataFormNode.jsx
  Wraps the SHACL form web component. It loads default metadata shapes or shapes
  from a selected AIMS profile and emits serialized RDF when the form is saved.

src/nodes/RDFStoreNode.jsx
  Loads connected Turtle RDF into rdfstore-js, shows triple counts, previews the
  loaded Turtle, and allows downloading metadata.ttl.

src/nodes/ROCrateNode.jsx
  Creates an RO-Crate ZIP using ro-crate and jszip. It includes data.json from
  connected RDF content, CSV exports for connected spreadsheet sheets under
  original_data/, and ro-crate-metadata.json.

Service files
-------------

src/services/aimsApi.js
  Fetches and normalizes AIMS application profile data.

src/services/columnDescriptionRdf.js
  Serializes column description fields into Turtle RDF.

src/services/metadataShapesService.js
  Loads metadata shape definitions, using a worker when available.

src/services/metadataShapes.worker.js
  Worker implementation for metadata shape processing.

src/services/qudtService.js
  Fetches and normalizes QUDT quantity kind and unit data.

RO-Crate export flow
--------------------

1. Load a spreadsheet with a Tabular File node.
2. Connect it to downstream tabular nodes and to an RO-Crate node if sheet CSVs
   should be included.
3. Create RDF by connecting Metadata Form, Column Description, or RDF Store
   output into the RO-Crate node.
4. Press Download on the RO-Crate node.

If the loaded workbook contains a sheet named export_config, the RO-Crate node
reads rows from that sheet to derive:

  dataset_id
  dataset_name
  dataset_title
  dataset_label
  title
  dataset_description
  description
  license

The exported ZIP name is based on dataset_id, dataset_name, or dataset. The
crate title falls back through dataset_title, dataset_label, title, and the
derived dataset id.

Notes
-----

npm run build may show a Vite warning about chunks larger than 500 kB. This is
expected because libraries such as rdfstore, xlsx, ro-crate, and jszip are large.
The warning is not a build failure.
