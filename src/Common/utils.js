const sanitizeName = (string) => {
  return string.replace(/\s+/g, '-');
}

const getRatingColor = (rating) => {
  if (rating < 5)
      return 'red';
  if (rating < 6.5)
      return 'orange';
  if (rating < 8)
      return 'green';
  else
      return 'purple';
}

const getYear = (date) => {
    return new Date(date).getFullYear();
}

const getCurrencyString = (amount) => {
    amount = parseInt(amount);
    let stringCurrency = '';
    if (amount >= 1000000000) {
        const millions = Math.round(amount/1000000000 * 10)/10;
        stringCurrency = `${millions} B`;
    } else if (amount >= 1000000) {
        const millions = Math.round(amount/1000000 * 10)/10;
        stringCurrency = `${millions} M`;
    } else {
        stringCurrency = `${amount}`;
    }
    return stringCurrency;
}

const getTMDBTimeFormat = (date) => {
    const dateObj = new Date(date);
    let month = dateObj.getMonth() || '';
    if (month < 10) {
        month = `0${month}`
    }
    let day = dateObj.getDate() || '';
    if (day < 10) {
        day = `0${day}`
    }
    return `${dateObj.getFullYear()}-${month}-${day}`
}

const getDateText = (date) => {
    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    const dateObj = new Date(date);
    return `${monthNames[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
}

export { sanitizeName, getRatingColor, getYear, getCurrencyString, getDateText, getTMDBTimeFormat };
