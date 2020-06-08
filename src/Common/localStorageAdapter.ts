import _ from 'lodash';

const getItemByName = (name: string) => {
    if (localStorage[name]) {
        return JSON.parse(localStorage[name]).reverse();
    } else {
        return [];
    }
}

const pushItemByName = (name: string, item: any) => {
    const localDataString = localStorage[name];
    let localData = [];
    if (localDataString) {
        localData = JSON.parse(localDataString);
        localData = _.filter(localData,
            ({ id }) => {
                return id !== parseInt(item.id);
            }
        );
        localData.push(item);
    } else{
        localData = [item]
    }
    const newLocalString = JSON.stringify(localData);
    localStorage.setItem(name, newLocalString);
}

const removeItemByName = (name: string, item: any) => {
    const localDataString = localStorage[name];
    if (localDataString) {
        let localData = JSON.parse(localDataString);
        localData = _.filter(localData,
            ({ id }) => {
                return id !== parseInt(item.id);
            }
        );
        const newLocalString = JSON.stringify(localData);
        localStorage.setItem(name, newLocalString);
    }
}

export { getItemByName, pushItemByName, removeItemByName };
