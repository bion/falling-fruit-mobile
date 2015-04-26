var auth_host, controllers, directives, factories, host, urls;

window.FallingFruitApp = angular.module('FallingFruitApp', ['ngRoute', 'ngAnimate', 'ngTouch']);

FallingFruitApp.config(function($interpolateProvider) {
  $interpolateProvider.startSymbol('[{');
  return $interpolateProvider.endSymbol('}]');
});

FallingFruitApp.config([
  '$httpProvider', function($httpProvider) {
    return $httpProvider.interceptors.push(function($q, $location, $rootScope, AuthFactory) {
      var interceptor;
      return interceptor = {
        request: function(config) {
          var auth_param;
          if (AuthFactory.needsAuth(config.url)) {
            auth_param = "user_email=" + (AuthFactory.get_email()) + "&auth_token=" + (AuthFactory.get_access_token()) + "&api_key=BJBNKMWM";
            config.url += config.url.indexOf("?") === -1 ? "?" + auth_param : "&" + auth_param;
          }
          return config || $q.when(config);
        },
        responseError: function(rejection) {
          $rootScope.$broadcast("LOADING-STOP");
          if (rejection.status === 401) {
            $rootScope.$broadcast("LOGGED-OUT");
          } else {
            $rootScope.$broadcast("LOADING-ERROR", "Please try again.");
          }
          return rejection || $q.reject(rejection);
        }
      };
    });
  }
]);

FallingFruitApp.config(function($routeProvider) {
  return $routeProvider.when('/search', {
    templateUrl: 'html/search.html',
    controller: 'SearchCtrl'
  }).when('/detail', {
    templateUrl: 'html/detail.html',
    controller: 'DetailCtrl'
  }).otherwise({
    redirectTo: '/search'
  });
});

auth_host = "https://fallingfruit.org/";

host = auth_host + "api/";

urls = {
  login: auth_host + "users/sign_in.json",
  register: auth_host + "users.json",
  forgot_password: auth_host + "users.json",
  nearby: host + "locations/nearby.json",
  markers: host + "locations/markers.json",
  location: host + "locations/",
  add_location: host + "locations.json",
  source_types: host + "locations/types.json",
  reviews: function(id) {
    return host + ("locations/" + id + "/reviews.json");
  }
};

controllers = {};

factories = {};

directives = {};

factories.AuthFactory = function($rootScope) {
  var props;
  props = {
    email: null,
    access_token: null,
    save: function(email, access_token) {
      this.email = email;
      this.access_token = access_token;
      localStorage.setItem('EMAIL', email);
      return localStorage.setItem('TOKEN', access_token);
    },
    is_logged_in: function() {
      if (!this.email) {
        this.email = localStorage.getItem("EMAIL");
      }
      if (!this.access_token) {
        this.access_token = localStorage.getItem("TOKEN");
      }
      if (!this.email || !this.access_token) {
        return false;
      } else {
        return true;
      }
    },
    clear: function() {
      this.email = this.access_token = null;
      localStorage.removeItem('EMAIL');
      return localStorage.removeItem('TOKEN');
    },
    get_access_token: function() {
      if (!this.access_token) {
        this.access_token = localStorage.getItem("TOKEN");
      }
      return this.access_token;
    },
    get_email: function() {
      if (!this.email) {
        this.email = localStorage.getItem("EMAIL");
      }
      return this.email;
    },
    get_login_user_model: function() {
      return {
        email: this.email,
        password: null
      };
    },
    get_register_user_model: function() {
      return {
        name: null,
        email: this.email,
        password: null
      };
    },
    needsAuth: function(url) {
      return url.indexOf(".html") === -1 && url.indexOf("/users/") === -1;
    }
  };
  return props;
};

controllers.AuthCtrl = function($scope, $rootScope, $http, $location, AuthFactory) {
  console.log("Auth Ctrl");
  $rootScope.$on("LOGGED-OUT", function() {
    AuthFactory.clear();
    $scope.login_user = AuthFactory.get_login_user_model();
    $scope.register_user = AuthFactory.get_register_user_model();
    $scope.show_auth = true;
    return $scope.auth_context = "login";
  });
  $scope.login = function() {
    return $http.post(urls.login, {
      user: $scope.login_user
    }).success(function(data) {
      if (data.hasOwnProperty("auth_token") && data.auth_token !== null) {
        AuthFactory.save($scope.login_user.email, data.auth_token);
        $scope.login_user = AuthFactory.get_login_user_model();
        $scope.show_auth = false;
        return $rootScope.$broadcast("LOGGED-IN");
      } else {
        return console.log("DATA isnt as expected", data);
      }
    }).error(function() {
      return $scope.login_user.password = null;
    });
  };
  $scope.register = function() {
    var user;
    user = {
      name: $scope.register_user.name,
      email: $scope.register_user.email,
      password: $scope.register_user.password
    };
    return $http.post(urls.register, {
      user: user
    }).success(function(data) {
      $rootScope.$broadcast("REGISTERED");
      alert("You've been registered! Please confirm your email address, then come back and login.");
      $scope.auth_context = "login";
      return $scope.login_user.email = $scope.register_user.email;
    }).error(function(data) {
      var error_text;
      $scope.register_user = AuthFactory.get_register_user_model();
      console.log("Register DATA isnt as expected", data);
      error_text = "Please check ";
      if (data.errors.email != null) {
        error_text += "email as it is: " + data.errors.email;
      }
      if (data.errors.password != null) {
        error_text += " Password is " + data.errors.password;
      }
      return alert("There was a registration error: " + error_text);
    });
  };
  $scope.forgot_password = function() {};
  if (!AuthFactory.is_logged_in()) {
    return $rootScope.$broadcast("LOGGED-OUT");
  } else {
    return $rootScope.$broadcast("SHOW-MAP");
  }
};

controllers.DetailCtrl = function($scope, $rootScope, $http, $timeout) {
  var distance, load_location, rad, reset;
  console.log("Detail Ctrl");
  reset = function() {
    $scope.location = {};
    $scope.current_location = null;
    $scope.current_review = null;
    $scope.reviews = [];
    return $http.get(urls.source_types).success(function(data) {
      return $scope.source_types = data;
    });
  };
  reset();
  load_location = function(id) {
    return $http.get(urls.location + id + ".json").success(function(data) {
      var latlng;
      latlng = new google.maps.LatLng(data.lat, data.lng);
      data.map_distance = google.maps.geometry.spherical.computeDistanceBetween(latlng, window.FFApp.map_obj.getCenter());
      if (window.FFApp.current_position) {
        data.current_distance = google.maps.geometry.spherical.computeDistanceBetween(latlng, window.FFApp.current_position);
      }
      data.season_string = $scope.season_string(data.season_start, data.season_stop, data.no_season);
      $scope.location = data;
      return console.log("DATA", data);
    });
  };
  $scope.season_string = function(season_start, season_stop, no_season) {
    if (no_season) {
      season_start = 0;
      season_stop = 11;
    }
    if (season_start !== null || season_stop !== null) {
      return (season_start !== null ? $scope.months[season_start] : "?") + " - " + (season_stop !== null ? $scope.months[season_stop] : "?");
    } else {
      return null;
    }
  };
  $scope.short_access_types = ["Added by owner", "Permitted by owner", "Public", "Private but overhanging", "Private"];
  $scope.ratings = ["Poor", "Fair", "Good", "Very good", "Excellent"];
  $scope.fruiting_status = ["Flowering", "Unripe fruit", "Ripe fruit"];
  $scope.months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  rad = function(x) {
    return x * Math.PI / 180;
  };
  distance = function(p1, p2) {
    var R, a, c, d, dlat, dlng;
    R = 6378137;
    dlat = rad(p2.lat() - p1.lat());
    dlng = rad(p2.lng() - p1.lng());
    a = Math.sin(dlat / 2) * Math.sin(dlat / 2) + Math.cos(rad(p1.lat())) * Math.cos(rad(p2.lat())) * Math.sin(dlng / 2) * Math.sin(dlng / 2);
    c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    d = R * c;
    return d;
  };
  $scope.selected_review_source_type = function() {
    return "Source Type";
  };
  $scope.selected_review_access_type = function() {
    return "Access Type";
  };
  $scope.selected_location_access_type = function() {
    return "Access Type";
  };
  $scope.selected_location_source_type = function() {
    return "Source Type";
  };
  $rootScope.$on("SHOW-DETAIL", function(event, id) {
    var center;
    console.log("SHOW-DETAIL", id);
    $scope.show_detail = true;
    if (id === void 0) {
      $scope.detail_context = "add_location";
      $scope.menu_title = "Add";
      if (window.FFApp.map_initialized === true) {
        center = window.FFApp.map_obj.getCenter();
        $scope.location.lat = center.lat();
        return $scope.location.lng = center.lng();
      }
    } else {
      $scope.location_id = id;
      load_location(id);
      $scope.detail_context = "view_location";
      return $scope.menu_title = "Location";
    }
  });
  $scope.show_reviews = function() {
    $scope.detail_context = 'view_reviews';
    $scope.menu_title = 'Reviews';
    return $http.get(urls.reviews($scope.location.id)).success(function(data) {
      var background_url, item, _i, _len;
      console.log("REVIEWS", data);
      for (_i = 0, _len = data.length; _i < _len; _i++) {
        item = data[_i];
        if (item.hasOwnProperty("photo_url") && item.photo_url !== null && item.photo_url.indexOf("missing.png") === -1) {
          background_url = "url('" + item.photo_url + "')";
        } else {
          background_url = "url('../img/png/no-image.png')";
        }
        item.style = {
          "background-image": background_url
        };
      }
      return $scope.reviews = data;
    });
  };
  $scope.save_location = function() {
    return $http.post(urls.add_location, {
      location: $scope.location
    }).success(function(data) {
      console.log("ADDED");
      $scope.location_id = data.id;
      load_location(data.id);
      return $scope.detail_context = "view_location";
    }).failure(function(data) {
      console.log("ADD FAILED");
      console.log(data);
      return $rootScope.$broadcast("SHOW-MAP");
    });
  };
  $scope.add_review = function(id) {
    if (id !== void 0) {
      $scope.current_review = _.findWhere($scope.reviews, {
        id: id
      });
      console.log("CR", $scope.current_review);
      $scope.menu_title = "Edit review";
    } else {
      $scope.current_review = DetailFactory.get_new_review_model();
      $scope.menu_title = "Add review";
    }
    return $scope.detail_context = "add_review";
  };
  return $scope.menu_left_btn_click = function() {
    if ($scope.detail_context === "add_review") {
      $scope.detail_context = "view_reviews";
      return $scope.menu_title = "Reviews";
    } else if ($scope.detail_context === "view_reviews") {
      $scope.detail_context = "view_location";
      return $scope.menu_title = "Location";
    } else if ($scope.detail_context === "add_location") {
      if ($scope.location_id === void 0) {
        $scope.show_detail = false;
        return $scope.location_id = void 0;
      } else {
        $scope.detail_context = "view_location";
        return $scope.menu_title = "Location";
      }
    } else if ($scope.detail_context === "view_location") {
      $timeout(reset, 500);
      $scope.show_detail = false;
      return $scope.location_id = void 0;
    }
  };
};

window.FFApp = {};

directives.mapContainer = function() {
  return {
    restrict: "C",
    template: "",
    scope: {
      stoplist: "=",
      directionstype: "="
    },
    controller: function($scope, $element, $http, $rootScope) {
      var add_markers_from_json, clear_offscreen_markers, container_elem, find_marker, initialize, load_map, setup_marker;
      container_elem = $element[0];
      window.FFApp.map_initialized = false;
      window.FFApp.defaultZoom = 14;
      window.FFApp.defaultMapTypeId = google.maps.MapTypeId.ROADMAP;
      window.FFApp.defaultCenter = new google.maps.LatLng(40.015, -105.27);
      window.FFApp.markersArray = [];
      window.FFApp.openMarker = null;
      window.FFApp.openMarkerId = null;
      window.FFApp.markersMax = 100;
      window.FFApp.current_position = null;
      window.FFApp.position_marker = undefined;
      window.FFApp.muni = true;
      window.FFApp.metric = true;
      clear_offscreen_markers = function() {
        var b, i, newMarkers, p;
        b = window.FFApp.map_obj.getBounds();
        i = 0;
        newMarkers = [];
        while (i < window.FFApp.markersArray.length) {
          p = window.FFApp.markersArray[i].marker.getPosition();
          if (!b.contains(p)) {
            window.FFApp.markersArray[i].marker.setMap(null);
          } else {
            newMarkers.push(window.FFApp.markersArray[i]);
          }
          i++;
        }
        return window.FFApp.markersArray = newMarkers;
      };
      window.clear_markers = function() {
        var marker, _i, _len, _ref;
        _ref = window.FFApp.markersArray;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          marker = _ref[_i];
          marker.marker.setMap(null);
        }
        return window.FFApp.markersArray = [];
      };
      window.do_markers = function(type_filter, cats) {
        var bounds, list_params;
        console.log("UPDATING MARKERS");
        bounds = window.FFApp.map_obj.getBounds();
        clear_offscreen_markers(bounds);
        if (window.FFApp.markersArray.length >= window.FFApp.markersMax) {
          return;
        }
        list_params = {
          nelat: bounds.getNorthEast().lat(),
          nelng: bounds.getNorthEast().lng(),
          swlat: bounds.getSouthWest().lat(),
          swlng: bounds.getSouthWest().lng(),
          api_key: "BJBNKMWM"
        };
        if (window.FFApp.muni) {
          list_params.muni = 1;
        } else {
          list_params.muni = 0;
        }
        if (cats !== undefined) {
          list_params.c = cats;
        }
        if (type_filter !== undefined) {
          list_params.t = type_filter;
        }
        return $http.get(urls.markers, {
          params: list_params
        }).success(function(json) {
          return add_markers_from_json(json);
        });
      };
      find_marker = function(lid) {
        var i;
        i = 0;
        while (i < window.FFApp.markersArray.length) {
          if (parseInt(window.FFApp.markersArray[i].id) === parseInt(lid)) {
            return i;
          }
          i++;
        }
        return undefined;
      };
      add_markers_from_json = function(mdata) {
        var h, ho, i, len, lid, m, n_found, n_limit, w, wo, _results;
        n_found = mdata.shift();
        n_limit = mdata.shift();
        len = mdata.length;
        i = 0;
        _results = [];
        while (i < len) {
          lid = mdata[i]["location_id"];
          if (find_marker(lid) !== undefined) {
            i++;
            continue;
          }
          if (window.FFApp.markersArray.length > window.FFApp.markersMax) {
            break;
          }
          w = 25;
          h = 25;
          wo = parseInt(w / 2, 10);
          ho = parseInt(h / 2, 10);
          if (window.FFApp.openMarkerId === lid) {
            m = window.FFApp.openMarker;
          } else {
            m = new google.maps.Marker({
              icon: {
                url: "img/png/map-location-dot.png",
                size: new google.maps.Size(w, h),
                origin: new google.maps.Point(0, 0),
                anchor: new google.maps.Point(w * 0.4, h * 0.4)
              },
              position: new google.maps.LatLng(mdata[i]["lat"], mdata[i]["lng"]),
              map: window.FFApp.map_obj,
              title: mdata[i]["title"],
              draggable: false,
              zIndex: 0
            });
            setup_marker(m, lid);
            window.FFApp.markersArray.push({
              marker: m,
              id: mdata[i]["location_id"],
              type: "point",
              types: mdata[i]["types"],
              parent_types: mdata[i]["parent_types"]
            });
          }
          _results.push(i++);
        }
        return _results;
      };
      setup_marker = function(marker, lid) {
        return google.maps.event.addListener(marker, "click", function() {
          window.FFApp.openMarkerId = lid;
          window.FFApp.openMarker = marker;
          return $rootScope.$broadcast("SHOW-DETAIL", lid);
        });
      };
      load_map = function(center) {
        var map_options;
        map_options = {
          center: center,
          zoom: window.FFApp.defaultZoom,
          mapTypeId: window.FFApp.defaultMapTypeId,
          mapTypeControl: false,
          streetViewControl: false,
          zoomControl: false,
          rotateControl: false,
          panControl: false
        };
        window.FFApp.map_obj = new google.maps.Map(window.FFApp.map_elem, map_options);
        window.FFApp.geocoder = new google.maps.Geocoder();
        google.maps.event.addListener(window.FFApp.map_obj, "idle", function() {
          return window.do_markers();
        });
        window.FFApp.map_initialized = true;
        return $rootScope.$broadcast("MAP-LOADED");
      };
      initialize = function() {
        if (window.FFApp.map_initialized === true) {
          return;
        }
        $scope.$emit("loading-start", "Loading maps...");
        if (window.FFApp.map_elem !== void 0) {
          return container_elem.appendChild(window.FFApp.map_elem);
        } else {
          window.FFApp.map_elem = document.createElement("div");
          window.FFApp.map_elem.className = "map";
          container_elem.appendChild(window.FFApp.map_elem);
          return navigator.geolocation.getCurrentPosition(function(position) {
            var center, lat, lng;
            lat = position.coords.latitude;
            lng = position.coords.longitude;
            center = new google.maps.LatLng(lat, lng);
            return load_map(center);
          }, function() {
            return load_map(window.FFApp.defaultCenter);
          });
        }
      };
      console.log("LOADING MAP DIRECTIVE, STOPS NOT LOADED YET");
      return initialize();
    }
  };
};

directives.loadingIndicator = function() {
  return {
    restrict: "C",
    template: "<div class='loading-image'></div><div class='loading-text'></div>",
    controller: function($scope, $element) {
      var default_text, loadingElem, loadingImageElem, loadingTextElem, reset;
      console.log("Loading indicator init");
      default_text = "Please wait..";
      loadingElem = $element[0];
      loadingImageElem = loadingElem.getElementsByClassName('loading-image')[0];
      loadingTextElem = loadingElem.getElementsByClassName('loading-text')[0];
      reset = function(timeOut) {
        if (timeOut === null) {
          timeOut = 300;
        }
        return setTimeout(function() {
          loadingTextElem.innerHTML = "Please wait...";
          return loadingImageElem.className = "loading-image";
        }, timeOut);
      };
      loadingElem.onclick = function() {
        loadingElem.classList.remove("show");
        return reset();
      };
      $scope.$on("loading-start", function(event, message) {
        console.log("Loading start called");
        loadingTextElem.innerHTML = message !== null ? message : "Please wait..";
        return loadingElem.classList.add("show");
      });
      $scope.$on("loading-stop", function(event, message) {
        console.log("Loading stop called");
        loadingTextElem.innerHTML = message !== null ? message : "Done";
        loadingImageElem.classList.add("completed");
        return setTimeout(function() {
          loadingElem.classList.remove("show");
          return reset();
        }, 750);
      });
      $scope.$on("loading-stop-immly", function(event, message) {
        console.log("Loading stop immly called");
        loadingTextElem.innerHTML = message !== null ? message : "Done";
        loadingImageElem.classList.add("completed");
        loadingElem.classList.remove("show");
        return reset();
      });
      return $scope.$on("loading-error", function(event, message) {
        console.log("Loading Error called");
        loadingTextElem.innerHTML = message !== null ? message : "Please try again.";
        loadingElem.classList.add("show");
        loadingImageElem.classList.add("error");
        return setTimeout(function() {
          loadingElem.classList.remove("show");
          return reset();
        }, 1000);
      });
    }
  };
};

directives.confirmDialog = function() {
  return {
    restrict: "C",
    template: "<div class='conf-container'><div class='conf-txt'>[{confmsg}]</div><div class='conf-ok' ng-click='okfn()'>[{oktxt}]</div><div class='conf-cancel' ng-click='cancelfn()'>[{canceltxt}]</div></div>",
    scope: {
      confmsg: "@",
      okfn: "&",
      cancelfn: "&",
      oktxt: "@",
      canceltxt: "@"
    }
  };
};

directives.ngSwitcher = function() {
  var props;
  props = {
    restrict: "C",
    template: '<a ng-click="toggleSwitch()" class="switcher"><div class="switcher-circle"></div></a>',
    scope: {
      toggle: "="
    },
    controller: function($scope, $element) {
      var switcherElem;
      switcherElem = $element[0].getElementsByClassName("switcher")[0];
      if ($scope.toggle === true) {
        switcherElem.classList.add("on");
      }
      return $scope.toggleSwitch = function() {
        switcherElem.classList.toggle("on");
        return $scope.toggle = !$scope.toggle;
      };
    }
  };
  return props;
};

controllers.MenuCtrl = function($scope, $rootScope, $http, $location) {
  var bicycleLayer, transitLayer;
  console.log("Menu Ctrl");
  $scope.mapTypeId = window.FFApp.defaultMapTypeId;
  $scope.toggle_terrain = function() {
    if ($scope.mapTypeId === 'terrain') {
      $scope.mapTypeId = 'roadmap';
    } else {
      $scope.mapTypeId = 'terrain';
    }
    return window.FFApp.map_obj.setMapTypeId($scope.mapTypeId);
  };
  $scope.toggle_hybrid = function() {
    if ($scope.mapTypeId === 'hybrid') {
      $scope.mapTypeId = 'roadmap';
    } else {
      $scope.mapTypeId = 'hybrid';
    }
    return window.FFApp.map_obj.setMapTypeId($scope.mapTypeId);
  };
  $scope.layer = null;
  bicycleLayer = new google.maps.BicyclingLayer();
  $scope.toggle_bicycle = function() {
    if ($scope.layer === 'bicycle') {
      bicycleLayer.setMap(null);
      $scope.layer = null;
    } else {
      bicycleLayer.setMap(window.FFApp.map_obj);
      $scope.layer = 'bicycle';
    }
    return transitLayer.setMap(null);
  };
  transitLayer = new google.maps.TransitLayer();
  $scope.toggle_transit = function() {
    if ($scope.layer === 'transit') {
      transitLayer.setMap(null);
      $scope.layer = null;
    } else {
      transitLayer.setMap(window.FFApp.map_obj);
      $scope.layer = 'transit';
    }
    return bicycleLayer.setMap(null);
  };
  $scope.muni = window.FFApp.muni;
  $scope.toggle_muni = function() {
    window.FFApp.muni = !window.FFApp.muni;
    $scope.muni = window.FFApp.muni;
    window.clear_markers();
    window.do_markers();
    if ($scope.current_view === "list") {
      return $scope.load_list();
    } else {
      return $scope.list_center = null;
    }
  };
  $scope.metric = window.FFApp.metric;
  $scope.toggle_metric = function() {
    window.FFApp.metric = !window.FFApp.metric;
    return $scope.metric = window.FFApp.metric;
  };
  return $scope.logout = function() {
    $rootScope.$broadcast("LOGGED-OUT");
    return $scope.show_menu = false;
  };
};

controllers.SearchCtrl = function($scope, $rootScope, $http, $location, AuthFactory) {
  console.log("Search Ctrl");
  $scope.current_view = "map";
  $scope.show_menu = false;
  $scope.search_text = '';
  $scope.targeted = false;
  $scope.show_map = function() {
    if ($scope.current_view !== "map") {
      return $scope.current_view = "map";
    }
  };
  $scope.list_center = null;
  $scope.$watch("list_center", function(newValue, oldValue) {
    if (newValue !== oldValue) {
      if ($scope.current_view === "list") {
        return $scope.load_list($scope.list_center);
      }
    }
  });
  $scope.show_list = function() {
    if ($scope.current_view !== "list") {
      $scope.current_view = "list";
      return $scope.list_center = window.FFApp.map_obj.getCenter();
    }
  };
  $scope.load_list = function(center) {
    var list_params, muni;
    if (!center) {
      center = window.FFApp.map_obj.getCenter();
    }
    if (window.FFApp.muni) {
      muni = 1;
    } else {
      muni = 0;
    }
    list_params = {
      lat: center.lat(),
      lng: center.lng(),
      muni: muni
    };
    return $http.get(urls.nearby, {
      params: list_params
    }).success(function(data) {
      var background_url, item, _i, _len;
      for (_i = 0, _len = data.length; _i < _len; _i++) {
        item = data[_i];
        if (item.hasOwnProperty("photos") && item.photos[0][0].thumbnail.indexOf("missing.png") === -1) {
          background_url = "url('" + item.photos[0][0].thumbnail + "')";
        } else {
          background_url = "url('../img/png/no-image.png')";
        }
        item.style = {
          "background-image": background_url
        };
      }
      return $scope.list_items = data;
    });
  };
  $scope.distance_string = function(meters) {
    var feet;
    if (window.FFApp.metric) {
      if (meters < 1000) {
        return parseFloat(meters.toPrecision(2)) + " m";
      } else {
        return parseFloat((meters / 1000).toPrecision(2)) + " km";
      }
    } else {
      feet = Math.round(meters / 0.3048);
      if (feet < 1000) {
        return parseFloat(feet.toPrecision(2)) + " ft";
      } else {
        return parseFloat((feet / 5280).toPrecision(2)) + " mi";
      }
    }
  };
  $scope.location_search = function() {
    var lat, latlng, lng, strsplit;
    strsplit = $scope.search_text.split(/[\s,]+/);
    if (strsplit.length === 2) {
      lat = parseFloat(strsplit[0]);
      lng = parseFloat(strsplit[1]);
      if (!isNaN(lat) && !isNaN(lng)) {
        latlng = new google.maps.LatLng(lat, lng);
        window.FFApp.map_obj.setZoom(17);
        window.FFApp.map_obj.panTo(latlng);
        $scope.list_center = latlng;
      }
    }
    return window.FFApp.geocoder.geocode({
      'address': $scope.search_text
    }, function(results, status) {
      var bounds;
      if (status === google.maps.GeocoderStatus.OK) {
        bounds = results[0].geometry.viewport;
        latlng = results[0].geometry.location;
        window.FFApp.map_obj.fitBounds(bounds);
        return $scope.list_center = latlng;
      } else {
        return console.log("Failed to do geocode");
      }
    });
  };
  $scope.update_position = function() {
    return navigator.geolocation.getCurrentPosition((function(position) {
      var h, w;
      console.log("position obtained!");
      window.FFApp.current_position = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);
      w = 40;
      h = 40;
      if (window.FFApp.position_marker === undefined) {
        window.FFApp.position_marker = new google.maps.Marker({
          icon: {
            url: "img/png/map-me-40.png",
            size: new google.maps.Size(w, h),
            origin: new google.maps.Point(0, 0),
            anchor: new google.maps.Point(w * 0.4, h * 0.4)
          },
          position: window.FFApp.current_position,
          map: window.FFApp.map_obj,
          title: "Current Position",
          draggable: false,
          zIndex: 100
        });
      } else {
        window.FFApp.position_marker.setPosition(window.FFApp.current_position);
      }
      window.FFApp.map_obj.panTo(window.FFApp.current_position);
      window.FFApp.map_obj.setZoom(window.FFApp.map_obj.getZoom());
      return $scope.list_center = window.FFApp.current_position;
    }), function() {
      return console.log("Failed to get position");
    });
  };
  return $scope.show_detail = function(location_id) {
    if ($scope.targeted) {
      if (window.FFApp.target_marker !== null) {
        window.FFApp.target_marker.setMap(null);
        window.FFApp.target_marker = null;
        $scope.targeted = false;
      }
      return $rootScope.$broadcast("SHOW-DETAIL", location_id);
    } else {
      if (window.FFApp.target_marker === undefined) {
        window.FFApp.target_marker = new google.maps.Marker({
          icon: {
            url: "img/png/control-add.png",
            size: new google.maps.Size(58, 75),
            origin: new google.maps.Point(0, 0),
            anchor: new google.maps.Point(58 * 0.4, 75 * 0.4)
          },
          position: window.FFApp.map_obj.getCenter(),
          map: window.FFApp.map_obj,
          title: "Target New Point",
          draggable: false
        });
        window.FFApp.target_marker.bindTo('position', window.FFApp.map_obj, 'center');
      }
      return $scope.targeted = true;
    }
  };
};

FallingFruitApp.directive(directives);

FallingFruitApp.factory(factories);

FallingFruitApp.controller(controllers);
