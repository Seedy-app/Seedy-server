'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('Communities', 'description', {
      type: Sequelize.STRING(1000),
      allowNull: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('Communities', 'description', {
      type: Sequelize.STRING(255),
      allowNull: true
    });
  }
};
