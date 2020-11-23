module.exports = val => {
    if(val != null) {
        const value = Number(val)
        if(isNaN(value)) {
            throw "ERROR: Could not parse value as integer: " + param
        }
        return value / 3200000000.0
    } else {
        return null
    }
}
