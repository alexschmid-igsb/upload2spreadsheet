# upload2spreadsheet
Very basic nodejs based command line tool to map and upload csv data into a google spreadsheets using the google sheets api. 

## Prerequisite

### Node.js

Install a recent node.js environment 

### Google Sheets API Credentials

Generate google sheets api credentials described in "Step 1: Turn on the Google Sheets API": https://developers.google.com/sheets/api/quickstart/nodejs.
Place credentials.json in the script folder.

## Clone and install
```
git clone https://github.com/alexschmid-igsb/upload2spreadsheet.git
cd upload2spreadsheet
npm install
```

## Configure
Create an upload configuration file:
```
{
    "csv": {
        "fileName": "autozygosity_münchen.csv",
        "idColumn": "id"
    },
    "spreadsheet": {
        "spreadsheetId": "1k8zBWi2xC9h9JNYrhCTSb-hb4EnUlYz7cc8dskdEydg",
        "sheetName": "Munich",
        "idColumn": "D"
    },
    "mappings": [
        {
            "source": "id",
            "target": "G"
        },
        {
            "source": "autozygosity",
            "target": "AZ",
            "transformer": "calculateValue.js"
        }
    ],
    "onNull": "KEEP"
}
```
***IMPORTANT:*** The `csv.fileName` path is defined relative to the path of the config file. The csv file must provide a header column to identify column names.

Fields `csv.idColumn` and `spreadsheet.idColumn` describe column names and will be used to link csv records to corresponding spreadsheet rows.

Field `mappings.source` specifies the source column from the csv file and `mappings.target` the target column in the spreadsheet.

The field `onNull` specifies the default behavior for `null` values: `"KEEP"` keeps the existing values and ignores `null` values while `"DELETE"` deletes all values with `null` entries.

## Run
```
npm run upload2spreadsheet ./autozygosity_münchen/settings.json
```
