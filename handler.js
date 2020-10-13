'use strict';

const Watchdog = require('./watchdog');
const util = require('util');
const UserDao = require('./user_dao');

module.exports.watch = async event => {
  await main();
  return {
    statusCode: 200,
    body: JSON.stringify(
      {
        message: 'Go Serverless v1.0! Your function executed successfully!',
        input: event,
      },
      null,
      2
    ),
  };

  // Use this code if you don't use the http event with the LAMBDA-PROXY integration
  // return { message: 'Go Serverless v1.0! Your function executed successfully!', event };
};

async function main() {
  console.log(`watch = ${util.inspect(Watchdog)}`);
  const userid = 'd61973a9-c91b-40b5-a67d-1fb081746861';
  const userDao = new UserDao();
  const user = await userDao.getUser(userid);
  if (!user) {
    console.log(`user not found, abort!`);
    return;
  }
  console.log(`user = ${util.inspect(user)}`);
  const dog = new Watchdog(user);
  await dog.asyncWatch();
} 