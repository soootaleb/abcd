export interface IMessage<T = Object> {
    type: string,
    source: string,
    destination: string,
    payload: T
}