const fs = require('fs')
const path = require('path')
const readline = require('readline')
const csvParse = require('csv-parse/lib/sync')
const { google } = require('googleapis')
var os = require('os');



const SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
const TOKEN_PATH = 'token.json'

const STARTING_ROW = 2



// ####################################################### GOOGLE API AUTHENTICATION #######################################################

// An die credentials.json kommt man, indem man über google die spreadsheet API aktiviert und die credentials runterlädt
// https://developers.google.com/sheets/api/quickstart/nodejs

fs.readFile('credentials.json', (err, content) => {
    if (err) return console.log("ERROR: Loading 'credentials.json':", err)

    // Authorize a client with credentials, then call main function
    authorize(JSON.parse(content), main)
})

 // Create an OAuth2 client with the given credentials, then execute the given callback function
function authorize(credentials, callback) {

    const { client_secret, client_id, redirect_uris } = credentials.installed
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])

    // Check if we have already a token
    fs.readFile(TOKEN_PATH, (err, token) => {
        if (err) return getNewToken(oAuth2Client, callback)
        oAuth2Client.setCredentials(JSON.parse(token))
        callback(oAuth2Client)
    })
}

 // Get and store a new token after prompting for user authorization, then execute the given callback with the authorized OAuth2 client
function getNewToken(oAuth2Client, callback) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    })
    console.log('AUTHORIZE THIS APP BY VISITING THIS URL:', authUrl)
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    })
    rl.question('ENTER THE CODE FROM THAT PAGE HERE:', (code) => {
        rl.close()
        oAuth2Client.getToken(code, (err, token) => {
            if (err) return console.error('ERROR: Trying to retrieve access token', err)
            oAuth2Client.setCredentials(token)
            // Store the token to disk for repeated use
            fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                if (err) return console.error(err)
                console.log('TOKEN STORED IN', TOKEN_PATH)
            })
            callback(oAuth2Client)
        })
    })
}



// ####################################################### MAIN CODE #######################################################

function loadSettings() {

    var settingsFile = process.argv[2]

    if(typeof settingsFile !== 'string' || settingsFile.length <=0 ) {
        console.log("ERROR: Settings file is missing!" + os.EOL)
        console.log("Usage: npm run main <settingsFile>")
        console.log("Usage: node src/main.js <settingsFile>")
        process.exit(0);
    }

    try {
        var settings = JSON.parse(fs.readFileSync(settingsFile));
    } catch(err) {
        console.log("ERROR: Could not load settings from '" + settingsFile + "'", err)
        process.exit(1)
    }

    let basePath = path.dirname(path.resolve(settingsFile))
    settings.csv.fileName = path.resolve(basePath + '/' + settings.csv.fileName)

    settings.mappings.map(mapping => {
        if(typeof mapping.transformer === 'string' && mapping.transformer.length > 0) {
            try {
                var transformerPath = path.resolve(basePath + '/' + mapping.transformer)
                mapping.transformer = require(transformerPath)
            } catch(err) {
                console.log("ERROR: Could not load transformer module from '" + transformerPath + "'", err)
                process.exit(1)
            }
        }
    })

    if(typeof settings['onNull'] === 'undefined' || settings['onNull'] === null || (settings['onNull'] !== 'KEEP' && settings['onNull'] !== 'DELETE')) {
        settings['onNull'] = 'KEEP'
    }

    return settings
}


function loadCSV(settings) {

    try {
        let data = new Map()
        let content = fs.readFileSync(settings.csv.fileName)
        let parsed = csvParse(content, {trim: true, columns: true})
        parsed.map(row => {
            let id = row[settings.csv.idColumn]
            if(typeof id === 'string' && id.length > 0) {
                data.set(id,row)
            }
        })
        return data
    } catch(err) {
        console.log("ERROR: Could not load data from CSV file '" + settings.csv.fileName + "'", err)
        process.exit(1)
    }
}


async function loadRows(sheets, settings) {

    try {

        var query = {
            spreadsheetId: settings.spreadsheet.spreadsheetId,
            range: settings.spreadsheet.sheetName + '!' + settings.spreadsheet.idColumn + STARTING_ROW + ':' + settings.spreadsheet.idColumn,
        }
    
        let result = await sheets.spreadsheets.values.get(query)
    
        let rows = []
        let rowIndex = STARTING_ROW
    
        result.data.values.map(row => {
            rows.push({
                'index': rowIndex,
                'id': row[0]
            })
            rowIndex++;
        })
    
        return rows

    } catch(err) {
        console.log("ERROR: During Google Spreadsheet API query: '" + JSON.stringify(query,null,2) + "'" + os.EOL, err)
        process.exit(1)
    }
}


function sleep(ms) {
    return new Promise( (resolve) => { setTimeout(resolve, ms) })
} 


async function main(auth) {
    
    let settings = loadSettings()
    let csvData = loadCSV(settings)

    const sheets = google.sheets({version: 'v4', auth})
    let rows = await loadRows(sheets, settings)

    let nMappings = settings.mappings.length
    let values = new Map()
    for(let iMapping=0; iMapping<nMappings; iMapping++) {
        values.set(iMapping,[])
    }

    rows.map(row => {
        let csvRecord = csvData.has(row.id) ? csvData.get(row.id) : {}
        for(let iMapping=0; iMapping<nMappings; iMapping++) {
            let mapping = settings.mappings[iMapping]
            let csvValue = csvRecord[mapping.source]
            if(typeof csvValue === 'undefined') csvValue = null
            if(typeof csvValue === 'string' && csvValue.trim().length <= 0) csvValue = null
            let value = csvValue
            if(typeof mapping.transformer === 'function') {
                try {
                    value = mapping.transformer(csvValue)
                } catch(err) {
                    console.log("ERROR: Could not transform value '" + value + "' from column '" + mapping.source + "' in csv record with id '" + row.id + "':", err)
                    process.exit(1)
                }
            }
            if(value === null && settings.onNull === 'DELETE') value = ""
            values.get(iMapping).push(value)
        }
    })

    for(let iMapping=0; iMapping<nMappings; iMapping++) {

        let mapping = settings.mappings[iMapping]
        let mappingValues = values.get(iMapping)

        // console.log(iMapping)
        // console.log(JSON.stringify(mappingValues,null,2))

        var range = settings.spreadsheet.sheetName + '!' + mapping.target + STARTING_ROW + ':' + mapping.target

        var query = {
            spreadsheetId: settings.spreadsheet.spreadsheetId,
            range: range,
            valueInputOption: 'RAW',
            resource: {
                range: range,
                majorDimension: 'COLUMNS',
                values: [mappingValues],
            }
        }
        
        await sheets.spreadsheets.values.update(query)

        await sleep(1001)
    }

}
