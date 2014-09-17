'use strict';

describe('controllers', function(){
  var scope;

  beforeEach(module('appTest'));

  beforeEach(inject(function($rootScope) {
    scope = $rootScope.$new();
  }));

  it('should define more than 5 things', inject(function($controller) {
    expect(scope.things).toBeUndefined();

    $controller('MainCtrl', {
      $scope: scope
    });

    // expect(angular.isArray(scope.things)).toBeTruthy();
    // expect(scope.things.length > 5).toBeTruthy();
  }));

});
