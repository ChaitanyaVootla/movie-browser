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

export { sanitizeName, getRatingColor, getYear };
