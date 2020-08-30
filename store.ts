interface IStore {
    [key: string]: string
}

export class Store {

    private store: IStore = {};

    /**
     * Retrieves a value in the store
     * @param key The key to fetch
     */
    public get(key: string): string {
        return this.store[key];
    }

    /**
     * Stores a key value pair in the store
     * 
     * [TODO] This method will eventually return error messages if the write didn't succeed
     * 
     * @param key The key to define
     * @param value The value to assign
     */
    public put(key: string, value: string): string {
        this.store[key] = value;
        return this.get(key);
    }
    
}