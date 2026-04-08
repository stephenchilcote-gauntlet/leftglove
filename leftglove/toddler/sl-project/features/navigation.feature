Feature: Arrow navigation between elements
  Arrow keys and buttons move between elements in the inventory,
  updating the progress counter and element detail panel.

  Background:
    Given :test opens the browser to 'http://localhost:8080?api=http://localhost:3333'
    And :test fills ToddlerLoop.url-input with 'http://localhost:3000/login'
    And :test clicks ToddlerLoop.navigate
    And :test should see ToddlerLoop.status with text 'elements'

  Scenario: Arrow right advances to next element
    Then :test should see ToddlerLoop.progress with text '#1'
    When :test presses ArrowRight
    Then :test should see ToddlerLoop.progress with text '#2'

  Scenario: Arrow button advances to next element
    When :test clicks ToddlerLoop.nav-next
    Then :test should see ToddlerLoop.progress with text '#2'

  Scenario: Arrow left goes to previous element
    When :test clicks ToddlerLoop.nav-next
    And :test clicks ToddlerLoop.nav-prev
    Then :test should see ToddlerLoop.progress with text '#1'
