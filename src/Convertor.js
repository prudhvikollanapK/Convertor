import React, { useState } from "react";
import * as XLSX from "xlsx";
import { parseString } from "xml2js";
import { parse } from "node-html-parser";

const MAX_CELL_LENGTH = 32767;

const Converter = () => {
  const [file, setFile] = useState(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const convertKMLToXLSX = () => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const kmlData = event.target.result;

      parseString(kmlData, (err, result) => {
        if (err) {
          console.error("Error parsing KML:", err);
          return;
        }

        const folders = result.kml.Document[0].Folder || [];
        const data = [];
        const placemarkData = [];
        let allColumnHeaders = new Set();
        const extractPlacemarkData = (folder) => {
          if (folder.Placemark) {
            folder.Placemark.forEach((placemark) => {
              const placemarkId =
                (placemark.$ && placemark.$.id) || `Placemark-${data.length}`;

              const placemarkDescriptionHTML = placemark.description
                ? placemark.description[0]
                : "";

              const placemarkParsedDescription = parse(
                placemarkDescriptionHTML
              );

              const property =
                placemarkParsedDescription
                  .querySelector('td:contains("Property") + td')
                  ?.text.trim() || " ";
              const fid =
                placemarkParsedDescription
                  .querySelector('td:contains("FID") + td')
                  ?.text.trim() || " ";
              const sizeHAElement = placemarkParsedDescription.querySelector(
                'td:contains("Size_HA") + td'
              );
              const sizeHA =
                sizeHAElement && sizeHAElement.text.trim()
                  ? parseFloat(sizeHAElement.text.trim()).toFixed(6)
                  : " ";
              const company =
                placemarkParsedDescription
                  .querySelector('td:contains("Company") + td')
                  ?.text.trim() || " ";

              let xParsed = " ";
              let yParsed = " ";

              const rows = placemarkParsedDescription.querySelectorAll("tr");
              rows.forEach((row) => {
                const cells = row.querySelectorAll("td");
                if (cells.length === 2) {
                  const label = cells[0].textContent.trim();
                  const value = cells[1].textContent.trim();

                  if (label === "x") {
                    xParsed = parseFloat(value).toFixed(6);
                  } else if (label === "y") {
                    yParsed = parseFloat(value).toFixed(6);
                  }
                }
              });

              let geoLocation = "";

              if (
                (xParsed !== undefined &&
                  xParsed === "" &&
                  xParsed !== null &&
                  !isNaN(xParsed)) ||
                (yParsed !== undefined &&
                  yParsed === "" &&
                  yParsed !== null &&
                  !isNaN(yParsed))
              ) {
                console.log("inside", xParsed, yParsed);
                geoLocation = `${xParsed}:${yParsed}`;
              }

              let geometry = " ";

              if (
                placemark.MultiGeometry &&
                placemark.MultiGeometry[0].Polygon
              ) {
                const polygons = placemark.MultiGeometry[0].Polygon;
                const coordArray =
                  polygons[0].outerBoundaryIs[0].LinearRing[0].coordinates[0]
                    .trim()
                    .split(" ");

                geometry = "MULTIPOLYGON Z (((";
                const coordinates = coordArray
                  .map((coord) => {
                    const [xCoord, yCoord, zCoord] = coord
                      .split(",")
                      .map((num) => {
                        const parsed = parseFloat(num);
                        return !isNaN(parsed) ? parsed : undefined;
                      });

                    if (
                      xCoord !== undefined &&
                      yCoord !== undefined &&
                      zCoord !== undefined
                    ) {
                      return `${xCoord} ${yCoord} ${zCoord}`;
                    } else {
                      return null;
                    }
                  })
                  .filter((coord) => coord !== null)
                  .join(", ");

                if (coordinates) {
                  geometry += `${coordinates})))`;
                } else {
                  geometry = " ";
                }

                if (geometry.length > MAX_CELL_LENGTH) {
                  console.warn(
                    `Geometry data for placemark ${placemarkId} is too long and will be truncated.`
                  );
                  geometry = geometry.substring(0, MAX_CELL_LENGTH);
                }
              }

              const truncateIfNeeded = (text) => {
                if (typeof text !== "string") text = String(text);
                return text.length > MAX_CELL_LENGTH
                  ? text.substring(0, MAX_CELL_LENGTH)
                  : text;
              };

              data.push({
                Name: truncateIfNeeded(property),
                Geometry: geometry,
                FID: truncateIfNeeded(fid),
                "Farm Name": truncateIfNeeded(property),
                Ownership: truncateIfNeeded(company),
                Size: truncateIfNeeded(sizeHA),
                Num: " ",
                Description: " ",
                Ptn_Erf: truncateIfNeeded(property),
                X: truncateIfNeeded(xParsed),
                Y: truncateIfNeeded(yParsed),
                "Geo Location": truncateIfNeeded(geoLocation),
              });

              const parsedDescription = parse(placemarkDescriptionHTML);
              const trElements = parsedDescription.querySelectorAll("tr");
              const placemarkRowData = { "Placemark ID": placemarkId };

              trElements.forEach((tr) => {
                const tdElements = tr.querySelectorAll("td");
                if (tdElements.length === 2) {
                  const columnHeader = tdElements[0].text.trim();
                  let value = tdElements[1].text.trim();

                  if (value.length > MAX_CELL_LENGTH) {
                    console.warn(
                      `Value for column ${columnHeader} in placemark ${placemarkId} is too long and will be truncated.`
                    );
                    value = value.substring(0, MAX_CELL_LENGTH);
                  }

                  placemarkRowData[columnHeader] = value;
                  allColumnHeaders.add(columnHeader);
                }
              });
              placemarkData.push(placemarkRowData);
            });
          }

          if (folder.Folder) {
            folder.Folder.forEach((subFolder) =>
              extractPlacemarkData(subFolder)
            );
          }
        };

        folders.forEach((folder) => extractPlacemarkData(folder));

        if (placemarkData.length === 0) {
          console.error("No data extracted from the KML file.");
          return;
        }

        const allHeaders = ["Placemark ID", ...Array.from(allColumnHeaders)];

        placemarkData.forEach((row) => {
          allHeaders.forEach((header) => {
            if (!row.hasOwnProperty(header)) {
              row[header] = "";
            }
          });
        });

        const worksheet1 = XLSX.utils.json_to_sheet(data);
        const worksheet2 = XLSX.utils.json_to_sheet(placemarkData, {
          header: allHeaders,
        });

        worksheet2["!cols"] = allHeaders.map(() => ({ wch: 20 }));
        worksheet1["!cols"] = [
          { wch: 25 }, // Name
          { wch: 25 }, // Geometry
          { wch: 10 }, // FID
          { wch: 25 }, // Farm Name
          { wch: 25 }, // Ownership
          { wch: 15 }, // Size
          { wch: 10 }, // Num
          { wch: 15 }, // Description
          { wch: 15 }, // Ptn_Erf
          { wch: 10 }, // X
          { wch: 10 }, // Y
          { wch: 20 }, // Geo Location
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet1, "Sheet1");
        XLSX.utils.book_append_sheet(workbook, worksheet2, "Sheet2");
        const excelBuffer = XLSX.write(workbook, {
          bookType: "xlsx",
          type: "array",
        });
        const blob = new Blob([excelBuffer], {
          type: "application/octet-stream",
        });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", "converted_file.xlsx");
        document.body.appendChild(link);
        link.click();
        link.remove();
      });
    };

    reader.readAsText(file);
  };

  return (
    <div>
      <h1>Converter</h1>
      <input type="file" accept=".kml" onChange={handleFileChange} />
      <button onClick={convertKMLToXLSX} disabled={!file}>
        Convert to XLSX
      </button>
    </div>
  );
};

export default Converter;
