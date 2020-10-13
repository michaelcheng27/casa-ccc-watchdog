var AWS = require('aws-sdk');
const TABLE_NAME = 'users';
AWS.config.update({ region: 'us-west-2' });

class UsersDao {
    constructor() {
        this.dynamodb = new AWS.DynamoDB();

    }

    async getUser(userId) {
        const user = await this.dynamodb.getItem({
            Key: {
                "id": {
                    S: `${userId}`
                }
            },
            TableName: `${TABLE_NAME}`
        }).promise();
        if (!user || !user.Item) {
            return null;
        }
        return AWS.DynamoDB.Converter.unmarshall(user.Item);
    }

    async putUser(user) {
        return await this.dynamodb.putItem(this.getParamFromUser(user)).promise();
    }

    getParamFromUser(user) {
        return {
            Item: {
                "id": {
                    S: user.id
                },
                "token": {
                    S: user.token
                },
                "update": {
                    S: `${Date.now()}`
                },
                "dropboxToken": {
                    S: user.dropboxToken
                }
            },
            TableName: `${TABLE_NAME}`
        }
    }
}

module.exports = UsersDao;