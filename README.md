OpenMRS Pull Request Dashboard
==============================

An [AngularJS](https://angularjs.org/) application for displaying
all open pull requests for [OpenMRS](https://github.com/openmrs/).
It uses [OAuth.io](https://oauth.io/) for 
[OAuth](http://en.wikipedia.org/wiki/Oauth)-based authentication to
[github](https://developer.github.com/v3/#authentication).

Why we authenticate users
-------------------------
While we only need to access publicly available endpoints of the 
API, anonymous access is 
[rate-limited](https://developer.github.com/v3/#rate-limiting) to only 
60 requests per hour.  By authenticating the user, we are allowed up to
5000 requests per hour (more than enough).

On a first visit, the user is directed to `/auth`, which redirects to
github, where they grant access to use their account to access publicly
available data.  After granting access, github redirects to `/callback`,
which pulls the authentication token from the response and redirects to
`/main` (the main application).

Using the application
---------------------
* **Filtering** &mdash; filter list of pull requests by text

* **Sorting** &mdash; pull requests can be sorted by repository, user
  date created, date updated, or those with unanswered comments first
  (any pull request where the latest comment is from the same person 
  who submitted the pull request is considered "unanswered").

* **Stats** &mdash; number of pull requests and average lifespan 
  (number of days since created) are displayed

Each pull request is summarized by title, days since last update, and,
when available, description.  Along the right, additional detail is 
shown, including the repository name, user who submitted the pull 
request, and days since the pull request was created.  Hovering over the 
days since updated or days since created will show the actual date.
All links will open in a new tab.
