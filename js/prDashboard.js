/**
 * Pull Request Dashboard app
 */
var prDashboard = angular.module('prDashboard', ['ngRoute'])

/**
 * Configure routes. We start at /auth, which redirects to github
 * (using oauth.io), returns to /callback to retrieve the 
 * authentication token and redirect to /main for main app page.
 */
prDashboard.config(['$routeProvider', function($routeProvider) {
	$routeProvider.
	when('/auth', {
		templateUrl: 'templates/auth.html',
		controller: 'AuthController'
	}).
	when('/callback', {
		templateUrl: 'templates/callback.html',
		controller: 'CallbackController'
	}).
	when('/main', {
		templateUrl: 'templates/main.html',
		controller: 'MainController'
	}).
	otherwise({
		redirectTo: '/auth'
	})
}])

/**
 * Authenticate to github, returning to /callback
 */
prDashboard.controller('AuthController', ['$scope', 
	function($scope) {
		var a = document.createElement('a')
		a.href = window.location
		var self = a.protocol + '//' + a.host + a.pathname
		OAuth.redirect('github', self + '#/callback')
	}
])

/**
 * When we return from github, pull authentication token from
 * the response, store in scope, then redirect to /main page
 */
prDashboard.controller('CallbackController', ['$rootScope', '$location',
	function($rootScope, $location) {
		OAuth.callback('github').done(function(result) {
			$rootScope.oauth = result
			$location.path('/main')
		})
	}
])

/**
 * Main controller for application
 */
prDashboard.controller('MainController', ['$scope', '$location', '$timeout',
    '$sce', '$filter', '$document', 'averageLifespanInDaysService',
	function($scope, $location, $timeout, $sce, $filter, $document, 
		     averageLifespanInDaysService) {
		// If authentication token not in scope, redirect to /auth page
		if (!$scope.oauth) {
			$scope.$apply(function() {
				$location.path('/auth')
			})
			return
		}

		// Fetch oauth.io to use for github calls
		var oauth = $scope.oauth

		// Set up sorting
		$scope.predicate = 'created_at'
		$scope.reverse = false

		// Define method for calculating average lifespan of pull requests
		$scope.averageLifespanInDays = function(pulls) {
			return averageLifespanInDaysService(pulls, $filter, $scope.filterText)
		}

		// Bind "/" key to move focus to filter input field
		$document.bind('keypress', function(event) {
			if (event.keyCode && event.keyCode == 47 && event.target.id != 'filter') {
				event.preventDefault()
				var elem = document.getElementById('filter')
				elem.focus()
				elem.select()
			}
		})

		// Okay, we're all set... start scanning OpenMRS repos
		scanRepos($scope, $timeout, $sce, oauth)
	}
])

/**
 * Scan OpenMRS org on github for all repos
 */
function scanRepos($scope, $timeout, $sce, oauth) {
	var repos = []
	$timeout(function() {
		$scope.$apply(function() {
			status = 'Scanning repos...'
		})
		getAll(oauth, '/orgs/openmrs/repos', function(repo) {
			repos.push(repo)
		}).then(function(response) {
			$scope.repos = repos
			// Given list of repos, scan each for pull requests
			scanPulls($scope, $sce, oauth)
		})
	})
}

/**
 * Scan repos for pull requests
 */
function scanPulls($scope, $sce, oauth) {
	$scope.status = 'Scanning pulls...'
	// We'll build a list of promises for scanning each repo
	var pulls = [], i, today = new Date(), pullPromises = []
	for (i in $scope.repos) {
		$scope.$apply(function() {
			status = 'Scanning pulls... ('+(parseInt(i)+1)+' of '+$scope.repos.length+')'
		})
		var repoName = $scope.repos[i].name
		pullPromises.push(getAll(oauth, '/repos/openmrs/'+repoName+'/pulls', function(pull) {
			// We only care about open pull requests
			if (pull.state == 'open') {
				// Add days since created/updated to pull request
				pull.days_since_created = daysBetween(
					new Date(pull.created_at), today)
				pull.days_since_updated = daysBetween(
					new Date(pull.updated_at), today)
				// HTMLify hyperlinks in description and mark as trusted
				pull.body = $sce.trustAsHtml(activateHyperlinks(pull.body))
				pulls.push(pull)
			}
		}))
	}
	// Ensure that all pull requests have been fetched
	Promise.all(pullPromises).then(function() {
		$scope.$apply(function() {
			$scope.pulls = pulls
		})
		// Once we have pull requests, fetch last comment for each
		scanLastComment($scope, oauth)			
	})
}

/**
 * Grab the most recent comment for each pull request and
 * add it to the pull request
 */
function scanLastComment($scope, oauth) {
	$scope.status = 'Scanning comments...'
	var i, commentPromises
	for (i in $scope.pulls) {
		(function(i) {
			// Fetch pull request comments in reverse order by date created
			oauth.get(($scope.pulls[i]._links.comments.href)+'?sort=created&direction=desc')
			.success(function(comments) {
				if (comments && comments.length >= 1) {
					// In descending order, first comment is last (most recent)
					$scope.pulls[i].last_comment = comments[0]
					$scope.$apply() // tell Angular to update view
				}
				if (i >= $scope.pulls.length-1) {
					// When we reach last pull request, clear status
					$scope.$apply(function() {
						$scope.status = ''
					})
				}
			})
		})(i)
	}
}

/*
 * Return a promise to fetch all paginated results 
 * from GitHub and execute map function on each result
 */
function getAll(oauth, path, map) {
 	return new Promise(function(resolve, reject) {
		oauth.get(path).done(function(data, status, headers) {
			angular.forEach(data, map)
			var next = parseNext(headers)
			if (next) {
				getAll(oauth, next, map).then(function (result) {
					resolve(result);
				})
			} else {
				resolve(1)
			}
		})
	})
}

/**
 * Grab the link to next page of paginated results from 
 * github's Link header
 */
function parseNext(headers) {
	var links = headers.getResponseHeader('Link')
	var matcher = (/<https:\/\/api.github.com([^>]+)>;\s+rel="next"/i).exec(links)
	if (matcher)
		return matcher[1]
	return null
}

/**
 * Calculate number of days between two dates
 */
function daysBetween(fromDate, toDate) {
	var oneDay = 24*60*60*1000 // hours*minutes*seconds*milliseconds
	return Math.round(
		Math.abs((toDate.getTime() - fromDate.getTime())/(oneDay)))
}

/**
 * Convert any text hyperlinks in string into HTML 
 */
function activateHyperlinks(s) {
	return s.replace(/(https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&\/=]*))/g,
		'<a href="$1" target="_blank">$1</a>')
}

/**
 * Register service to calculate average lifespan (days
 * since created) of currently displayed pull requests
 */
prDashboard.factory('averageLifespanInDaysService', function() {
	return function(allPulls, $filter, filterText) {

		// Apply current filter to pull requests
		var pulls = $filter('filter')(allPulls, filterText, false)

		// If list is empty, we can't calculate an average
		if (!pulls || pulls.length < 1) {
			return '?'
		}

		// Calculate and return average days since created
		var i, total = 0
		for (i in pulls) {
			total += pulls[i].days_since_created
		}
		return Math.round(total / pulls.length)
	}
})

