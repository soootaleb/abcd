export interface IMessage<T = Object> {
    type: string,
    source: string,
    destination: string,
    payload: T
}

export interface IKeyValue<T = string> {
    key: string,
    value: T
}